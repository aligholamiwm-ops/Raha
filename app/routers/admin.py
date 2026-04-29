import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel
from app.models.vpn_config import ConfigStatus
from app.integrations.xui_api import AsyncXUIClient

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get(
    "/stats",
    summary="Dashboard statistics",
)
async def get_stats(
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    total_users = await db.users.count_documents({})
    active_configs = await db.vpn_configs.count_documents(
        {"status": ConfigStatus.active.value}
    )
    expired_configs = await db.vpn_configs.count_documents(
        {"status": ConfigStatus.expired.value}
    )

    # Total revenue: sum of completed payments
    pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_usd"}}},
    ]
    revenue_cursor = db.payments.aggregate(pipeline)
    revenue_doc = await revenue_cursor.to_list(length=1)
    total_revenue = revenue_doc[0]["total"] if revenue_doc else 0.0

    total_tickets = await db.tickets.count_documents({})
    open_tickets = await db.tickets.count_documents({"status": "open"})

    return {
        "total_users": total_users,
        "active_configs": active_configs,
        "expired_configs": expired_configs,
        "total_revenue_usd": round(total_revenue, 2),
        "total_tickets": total_tickets,
        "open_tickets": open_tickets,
    }


@router.post(
    "/sync-configs",
    summary="Sync config statuses from XUI panels",
)
async def sync_configs(
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    servers_updated = 0
    configs_updated = 0
    errors = []

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
            logger.warning("sync_configs error for %s: %s", server_doc["server_name"], exc)
            continue

        servers_updated += 1
        now = datetime.now(timezone.utc)

        for client in clients:
            c_uuid = client.get("uuid")
            if not c_uuid:
                continue

            expiry_ms = client.get("expiry_time_ms", 0)
            expiry_date = None
            if expiry_ms and expiry_ms > 0:
                expiry_date = datetime.fromtimestamp(expiry_ms / 1000.0, tz=timezone.utc)

            usage_up = client.get("usage_up", 0)
            usage_down = client.get("usage_down", 0)
            total_gb = client.get("total_gb", 0)
            used_bytes = usage_up + usage_down
            used_gb = used_bytes / (1024**3)

            # Determine status
            status = ConfigStatus.active.value
            if not client.get("enable", True):
                status = ConfigStatus.expired.value
            elif total_gb > 0 and used_gb >= total_gb:
                status = ConfigStatus.expired.value
            elif expiry_date and expiry_date < now:
                status = ConfigStatus.expired.value

            update_result = await db.vpn_configs.update_one(
                {"uuid": c_uuid},
                {
                    "$set": {
                        "usage_up": usage_up,
                        "usage_down": usage_down,
                        "status": status,
                        "expiry_date": expiry_date,
                        "domain_name": client.get("domain_name", ""),
                    }
                },
            )
            if update_result.modified_count:
                configs_updated += 1

    return {
        "servers_synced": servers_updated,
        "configs_updated": configs_updated,
        "errors": errors,
    }
