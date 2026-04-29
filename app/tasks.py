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


# ---------------------------------------------------------------------------
# Config status sync
# ---------------------------------------------------------------------------

@celery_app.task(name="app.tasks.sync_config_statuses")
def sync_config_statuses() -> dict:
    """Sync VPN config usage and status from all XUI panels."""
    from app.integrations.xui_api import AsyncXUIClient

    async def _run():
        db, client = _get_db()
        configs_updated = 0
        errors = []
        try:
            async for server_doc in db.servers.find({}):
                server_doc.pop("_id", None)
                base_url = f"http://{server_doc['ip_address']}:{server_doc['panel_port']}"
                xui = AsyncXUIClient(
                    base_url=base_url,
                    username=server_doc["username"],
                    password=server_doc["password"],
                    inbound_id=server_doc["inbound_id"],
                    server_name=server_doc["server_name"],
                    db=db,
                )
                if server_doc.get("cookie"):
                    xui.set_cookie(server_doc["cookie"])

                try:
                    clients = await xui.get_client_info()
                except Exception as exc:
                    errors.append(f"{server_doc['server_name']}: connection or parse error")
                    logger.warning(
                        "sync_config_statuses error for %s: %s",
                        server_doc["server_name"], exc,
                    )
                    continue

                now = datetime.now(timezone.utc)
                for c in clients:
                    c_uuid = c.get("uuid")
                    if not c_uuid:
                        continue

                    expiry_ms = c.get("expiry_time_ms", 0)
                    expiry_date = None
                    if expiry_ms and expiry_ms > 0:
                        expiry_date = datetime.fromtimestamp(expiry_ms / 1000.0, tz=timezone.utc)

                    usage_up = c.get("usage_up", 0)
                    usage_down = c.get("usage_down", 0)
                    total_gb = c.get("total_gb", 0)
                    used_gb = (usage_up + usage_down) / (1024**3)

                    status = "active"
                    if not c.get("enable", True):
                        status = "expired"
                    elif total_gb > 0 and used_gb >= total_gb:
                        status = "expired"
                    elif expiry_date and expiry_date < now:
                        status = "expired"

                    res = await db.vpn_configs.update_one(
                        {"uuid": c_uuid},
                        {
                            "$set": {
                                "usage_up": usage_up,
                                "usage_down": usage_down,
                                "status": status,
                                "expiry_date": expiry_date,
                                "domain_name": c.get("domain_name", ""),
                            }
                        },
                    )
                    if res.modified_count:
                        configs_updated += 1
        finally:
            client.close()

        return {"configs_updated": configs_updated, "errors": errors}

    return asyncio.run(_run())


# ---------------------------------------------------------------------------
# Expire old configs
# ---------------------------------------------------------------------------

@celery_app.task(name="app.tasks.expire_old_configs")
def expire_old_configs() -> dict:
    """Mark as expired any configs whose expiry_date is in the past."""

    async def _run():
        db, client = _get_db()
        try:
            now = datetime.now(timezone.utc)
            result = await db.vpn_configs.update_many(
                {
                    "status": "active",
                    "expiry_date": {"$lt": now, "$ne": None},
                },
                {"$set": {"status": "expired"}},
            )
            return {"expired_count": result.modified_count}
        finally:
            client.close()

    return asyncio.run(_run())
