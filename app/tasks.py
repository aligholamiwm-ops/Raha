"""
Celery tasks for Raha VPN backend.

These tasks run in a separate worker process; they use synchronous Motor via
asyncio.run() because Celery workers are not async by default. For long-running
async work we run an event loop explicitly.
"""
import asyncio
import logging
from datetime import datetime, timezone

from app.celery_worker import celery_app
from app.config import get_settings
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)


def _get_db():
    settings = get_settings()
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    return client[settings.MONGODB_DB_NAME], client


# ---------------------------------------------------------------------------
# Payment webhook processing
# ---------------------------------------------------------------------------

@celery_app.task(name="app.tasks.process_payment_webhook", bind=True, max_retries=3)
def process_payment_webhook(self, webhook_data: dict) -> dict:
    """
    Process a Plisio IPN webhook asynchronously via Celery.
    Used when the webhook endpoint enqueues processing instead of doing it inline.
    """
    async def _run():
        db, client = _get_db()
        try:
            txn_id: str = webhook_data.get("txn_id", "")
            order_number: str = webhook_data.get("order_number", "")
            plisio_status: str = webhook_data.get("status", "")

            payment_doc = await db.payments.find_one({"payment_id": order_number})
            if not payment_doc or payment_doc.get("status") == "completed":
                return {"ok": True, "skipped": True}

            if plisio_status in ("completed", "mismatch"):
                telegram_id: int = payment_doc["telegram_id"]
                amount_usd: float = payment_doc["amount_usd"]
                await db.users.update_one(
                    {"telegram_id": telegram_id},
                    {"$inc": {"wallet_balance_usd": amount_usd}},
                )
                await db.payments.update_one(
                    {"payment_id": order_number},
                    {
                        "$set": {
                            "status": "completed",
                            "plisio_txn_id": txn_id,
                            "completed_at": datetime.now(timezone.utc),
                        }
                    },
                )
                logger.info("Task: payment %s completed for user %s", order_number, telegram_id)

            elif plisio_status in ("expired", "cancelled", "error"):
                await db.payments.update_one(
                    {"payment_id": order_number},
                    {"$set": {"status": plisio_status}},
                )

            return {"ok": True}
        finally:
            client.close()

    try:
        return asyncio.run(_run())
    except Exception as exc:
        logger.error("process_payment_webhook failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
