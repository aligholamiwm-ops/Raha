from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import get_settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_db() -> None:
    global _client, _db
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.MONGODB_URL)
    _db = _client[settings.MONGODB_DB_NAME]
    await _create_indexes(_db)


async def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def get_database() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not connected. Call connect_db() first.")
    return _db


async def _create_indexes(db: AsyncIOMotorDatabase) -> None:
    await db.users.create_index("telegram_id", unique=True)
    await db.servers.create_index("server_name", unique=True)
    await db.vpn_configs.create_index("uuid", unique=True)
    await db.vpn_configs.create_index("telegram_id")
    await db.vpn_configs.create_index("server_name")
    await db.vpn_configs.create_index("status")
    await db.vpn_configs.create_index("email")
    await db.clean_ips.create_index("isp_name")
    await db.plans.create_index("plan_name", unique=True)
    await db.tickets.create_index("ticket_id", unique=True)
    await db.tickets.create_index("telegram_id")
    await db.discounts.create_index("code", unique=True)
    await db.payments.create_index("payment_id", unique=True)
    await db.payments.create_index("telegram_id")
    await db.payments.create_index("plisio_txn_id")
