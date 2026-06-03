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
from app.integrations.xui_api import build_xui_client
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

_BYTES_TO_GB = 1024 ** 3


def _get_db():
    settings = get_settings()
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    return client[settings.MONGODB_DB_NAME], client


# ---------------------------------------------------------------------------
# Hourly usage tracking (Bucket Pattern)
# ---------------------------------------------------------------------------

@celery_app.task(name="app.tasks.track_hourly_usage", bind=True, max_retries=3)
def track_hourly_usage(self) -> dict:
    """
    Fetch live traffic data from each XUI server, compute per-client hourly
    deltas, and persist them into the config_usages / inbound_usages bucket
    collections using MongoDB's $inc operator.

    Non-active (disabled/expired) configs that have just transitioned from
    active will have their final delta captured before being skipped in
    subsequent runs.  Configs already marked "deleted" in the DB, or those
    that were non-active on the previous run with no new traffic, are skipped
    entirely to avoid redundant work.
    """
    async def _run():
        db, mongo_client = _get_db()
        try:
            settings = get_settings()
            now = datetime.now(timezone.utc)
            today_midnight = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
            hour = now.hour

            for server in settings.get_enabled_servers():
                server_name = server.get("name", "")
                try:
                    xui = build_xui_client(server)
                    clients = await xui.get_client_info()
                except Exception as exc:
                    logger.error(
                        "track_hourly_usage: failed to fetch clients from server %s: %s",
                        server_name, exc,
                    )
                    continue

                # Accumulate inbound-level deltas: {inbound_id -> {"up": bytes, "down": bytes}}
                inbound_deltas: dict = {}

                for c in clients:
                    config_uuid = c.get("uuid", "")
                    if not config_uuid:
                        continue

                    email = c.get("email", "")
                    usage_up = float(c.get("usage_up", 0))
                    usage_down = float(c.get("usage_down", 0))
                    enable = c.get("enable", True)
                    total_gb = c.get("total_gb", 0.0)
                    expiry_ms = c.get("expiry_time_ms", 0)
                    expiry_date = (
                        datetime.fromtimestamp(expiry_ms / 1000, tz=timezone.utc)
                        if expiry_ms and expiry_ms > 0
                        else None
                    )
                    used_gb = (usage_up + usage_down) / _BYTES_TO_GB

                    if not enable:
                        client_status = "disabled"
                    elif (total_gb > 0 and used_gb >= total_gb) or (
                        expiry_date and expiry_date < now
                    ):
                        client_status = "expired"
                    else:
                        client_status = "active"

                    # Hard-skip configs already marked "deleted" in the DB — they have
                    # been fully accounted for by the delete API route.
                    existing_doc = await db.config_usages.find_one(
                        {"uuid": config_uuid, "date": today_midnight},
                        {"client_status": 1, "_id": 0},
                    )
                    if existing_doc and existing_doc.get("client_status") == "deleted":
                        continue

                    # Retrieve the previous usage snapshot to compute delta and to
                    # know whether this config was already non-active on the last run.
                    snapshot = await db.usage_snapshots.find_one({"uuid": config_uuid})
                    prev_up = float(snapshot["usage_up"]) if snapshot else 0.0
                    prev_down = float(snapshot["usage_down"]) if snapshot else 0.0
                    prev_status = snapshot.get("client_status", "active") if snapshot else "active"

                    delta_up_bytes = max(0.0, usage_up - prev_up)
                    delta_down_bytes = max(0.0, usage_down - prev_down)

                    # For non-active configs: skip only if this config was already
                    # non-active in the previous run AND produced no new traffic.
                    # This ensures any bandwidth consumed right before a status change
                    # (disabled/expired) is captured in the final delta pass.
                    if client_status != "active":
                        if prev_status != "active" and delta_up_bytes == 0.0 and delta_down_bytes == 0.0:
                            continue

                        # Capture the final delta for this now-non-active config.
                        empty_hourly = [{"u": 0.0, "d": 0.0} for _ in range(24)]
                        await db.config_usages.update_one(
                            {"uuid": config_uuid, "date": today_midnight},
                            {
                                "$set": {
                                    "email": email,
                                    "server_name": server_name,
                                    "client_status": client_status,
                                },
                                "$setOnInsert": {"hourly_usage": empty_hourly},
                            },
                            upsert=True,
                        )

                        # Persist snapshot (including status) so the next run can
                        # safely skip this config when it is still non-active.
                        await db.usage_snapshots.update_one(
                            {"uuid": config_uuid},
                            {
                                "$set": {
                                    "usage_up": usage_up,
                                    "usage_down": usage_down,
                                    "client_status": client_status,
                                    "updated_at": now,
                                }
                            },
                            upsert=True,
                        )

                        delta_up_gb = round(delta_up_bytes / _BYTES_TO_GB, 2)
                        delta_down_gb = round(delta_down_bytes / _BYTES_TO_GB, 2)
                        if delta_up_gb > 0 or delta_down_gb > 0:
                            await db.config_usages.update_one(
                                {"uuid": config_uuid, "date": today_midnight},
                                {
                                    "$inc": {
                                        f"hourly_usage.{hour}.u": delta_up_gb,
                                        f"hourly_usage.{hour}.d": delta_down_gb,
                                    }
                                },
                            )

                        # Non-active configs do not contribute to inbound-level totals.
                        continue

                    empty_hourly = [{"u": 0.0, "d": 0.0} for _ in range(24)]
                    # Upsert today's document; pre-allocate hourly_usage on first insert
                    await db.config_usages.update_one(
                        {"uuid": config_uuid, "date": today_midnight},
                        {
                            "$set": {
                                "email": email,
                                "server_name": server_name,
                                "client_status": client_status,
                            },
                            "$setOnInsert": {"hourly_usage": empty_hourly},
                        },
                        upsert=True,
                    )

                    # Persist snapshot update regardless of whether deltas are zero
                    await db.usage_snapshots.update_one(
                        {"uuid": config_uuid},
                        {
                            "$set": {
                                "usage_up": usage_up,
                                "usage_down": usage_down,
                                "client_status": client_status,
                                "updated_at": now,
                            }
                        },
                        upsert=True,
                    )

                    # Convert to GB (2 decimal places) and update hourly bucket
                    delta_up_gb = round(delta_up_bytes / _BYTES_TO_GB, 2)
                    delta_down_gb = round(delta_down_bytes / _BYTES_TO_GB, 2)

                    if delta_up_gb > 0 or delta_down_gb > 0:
                        await db.config_usages.update_one(
                            {"uuid": config_uuid, "date": today_midnight},
                            {
                                "$inc": {
                                    f"hourly_usage.{hour}.u": delta_up_gb,
                                    f"hourly_usage.{hour}.d": delta_down_gb,
                                }
                            },
                        )

                    # Accumulate inbound-level deltas
                    inbound_id = c.get("inbound_id", server.get("inbound_id", 1))
                    if inbound_id not in inbound_deltas:
                        inbound_deltas[inbound_id] = {"up": 0.0, "down": 0.0}
                    inbound_deltas[inbound_id]["up"] += delta_up_bytes
                    inbound_deltas[inbound_id]["down"] += delta_down_bytes

                # Update inbound_usages for each inbound that had active traffic
                empty_hourly_inbound = [{"u": 0, "d": 0} for _ in range(24)]
                for inbound_id, deltas in inbound_deltas.items():
                    await db.inbound_usages.update_one(
                        {
                            "server_name": server_name,
                            "inbound_id": inbound_id,
                            "date": today_midnight,
                        },
                        {"$setOnInsert": {"hourly_usage": empty_hourly_inbound}},
                        upsert=True,
                    )
                    delta_up_int = round(deltas["up"] / _BYTES_TO_GB)
                    delta_down_int = round(deltas["down"] / _BYTES_TO_GB)
                    if delta_up_int > 0 or delta_down_int > 0:
                        await db.inbound_usages.update_one(
                            {
                                "server_name": server_name,
                                "inbound_id": inbound_id,
                                "date": today_midnight,
                            },
                            {
                                "$inc": {
                                    f"hourly_usage.{hour}.u": delta_up_int,
                                    f"hourly_usage.{hour}.d": delta_down_int,
                                }
                            },
                        )

            return {"ok": True}
        finally:
            mongo_client.close()

    try:
        return asyncio.run(_run())
    except Exception as exc:
        logger.error("track_hourly_usage failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)


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
