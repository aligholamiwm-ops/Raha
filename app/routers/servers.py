import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from typing import List, Optional
from app.dependencies import require_admin
from app.models.user import UserModel
from app.config import get_settings, Settings
from app.integrations.xui_api import build_xui_client
from app.database import get_database

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get('/', summary='List all servers from .env (admin)')
async def list_servers(
    _admin: UserModel = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Returns servers configured in .env (sensitive fields excluded)."""
    servers = settings.get_server_list()
    return [
        {
            "name": s.get("name", s.get("server_name", "")),
            "ip": s.get("ip", s.get("ip_address", "")),
            "port": s.get("port", s.get("panel_port", 2053)),
            "scheme": s.get("scheme", "http"),
            "base_path": s.get("base_path", ""),
            "inbound_id": s.get("inbound_id", 1),
            "status": s.get("status", "enabled"),
            "auth_mode": "api_token" if s.get("api_token") else ("password" if s.get("password") else "none"),
            "has_sub_uri": bool(s.get("sub_uri")),
        }
        for s in servers
    ]


@router.post('/{server_name}/test', summary='Test XUI connection for a server (admin)')
async def test_server_connection(
    server_name: str,
    _admin: UserModel = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    servers = settings.get_server_list()
    server = next(
        (s for s in servers if s.get("name", s.get("server_name", "")) == server_name),
        None,
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found in .env configuration")

    try:
        xui = build_xui_client(server)
        cookie = await xui.login()
        inbounds = await xui.get_inbounds()
        inbound_id = int(server.get("inbound_id", 1))
        target_inbound = next((ib for ib in inbounds if ib.get("id") == inbound_id), None)
        inbound_up = 0
        inbound_down = 0
        if target_inbound:
            inbound_up = target_inbound.get("up", 0) or 0
            inbound_down = target_inbound.get("down", 0) or 0
        return {
            "status": "success",
            "server_name": server_name,
            "inbounds_count": len(inbounds),
            "target_inbound": target_inbound,
            "inbound_up_gb": round(inbound_up / (1024 ** 3), 3),
            "inbound_down_gb": round(inbound_down / (1024 ** 3), 3),
        }
    except Exception as exc:
        logger.error("test_server_connection failed for %s: %s", server_name, exc)
        raise HTTPException(status_code=502, detail=f"Failed to connect to server: {exc}")


class ServerUsagePoint(BaseModel):
    ts: str = Field(description="ISO-8601 UTC timestamp for this bucket")
    gb: float = Field(description="Total traffic (upload + download) in GB")


@router.get(
    "/server-usage",
    response_model=List[ServerUsagePoint],
    summary="Get aggregated server usage history across all servers (admin)",
)
async def get_server_usage(
    timeframe: str = Query(default="H", pattern="^(H|D)$", description="H=hourly, D=daily"),
    window: str = Query(default="1D", pattern="^(1D|1W|1M|all)$", description="Time window: 1D, 1W, 1M, or all"),
    server_name: Optional[str] = Query(default=None, description="Optional server name filter"),
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> List[ServerUsagePoint]:
    now = datetime.now(timezone.utc)
    today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

    query: dict = {}
    if server_name:
        query["server_name"] = server_name
    if window == "1D":
        query["date"] = {"$gte": today}
    elif window == "1W":
        query["date"] = {"$gte": today - timedelta(days=6)}
    elif window == "1M":
        query["date"] = {"$gte": today - timedelta(days=29)}
    # "all" → no date filter

    cursor = db.server_usages.find(
        query,
        {"date": 1, "hourly_usage": 1, "_id": 0},
    ).sort("date", 1)
    docs = await cursor.to_list(length=None)

    def _utc_day(day: datetime) -> datetime:
        return day if day.tzinfo is not None else day.replace(tzinfo=timezone.utc)

    if timeframe == "H":
        bucket_map: dict = defaultdict(float)
        for doc in docs:
            day = _utc_day(doc["date"])
            for hour, bucket in enumerate(doc.get("hourly_usage", [])):
                ts = (day + timedelta(hours=hour)).isoformat()
                bucket_map[ts] += (bucket.get("u", 0) + bucket.get("d", 0))
        return [ServerUsagePoint(ts=ts, gb=round(v, 4)) for ts, v in sorted(bucket_map.items())]
    else:
        daily_map: dict = defaultdict(float)
        for doc in docs:
            day = _utc_day(doc["date"])
            day_str = day.isoformat()
            for bucket in doc.get("hourly_usage", []):
                daily_map[day_str] += (bucket.get("u", 0) + bucket.get("d", 0))
        return [ServerUsagePoint(ts=ts, gb=round(v, 4)) for ts, v in sorted(daily_map.items())]


class AvailableInboundsPayload(BaseModel):
    inbound_ids: list[int] = Field(..., description="List of inbound IDs to use as available")


@router.get(
    "/available-inbounds/list",
    summary="List all inbounds from all servers (admin)",
)
async def list_available_inbounds(
    _admin: UserModel = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    async def _fetch(server: dict) -> list[dict]:
        server_name = server.get("name", "")
        try:
            xui = build_xui_client(server)
            inbounds = await xui.get_inbound_list()
            return [{"id": ib["id"], "remark": ib.get("remark", f"inbound-{ib['id']}"), "server_name": server_name} for ib in inbounds if "id" in ib]
        except Exception as exc:
            logger.warning("Failed to fetch inbounds from %s: %s", server_name, exc)
            return []

    tasks = [_fetch(s) for s in settings.get_enabled_servers()]
    results = await asyncio.gather(*tasks)
    combined = []
    for r in results:
        combined.extend(r)
    return combined


@router.get(
    "/available-inbounds",
    summary="Get saved available inbound IDs (admin)",
)
async def get_available_inbounds(
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    doc = await db.settings.find_one({"_id": "available_inbound_ids"})
    return {"inbound_ids": doc.get("inbound_ids", []) if doc else []}


@router.put(
    "/available-inbounds",
    summary="Save available inbound IDs (admin)",
)
async def save_available_inbounds(
    payload: AvailableInboundsPayload,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    await db.settings.update_one(
        {"_id": "available_inbound_ids"},
        {"$set": {"inbound_ids": payload.inbound_ids}},
        upsert=True,
    )
    return {"inbound_ids": payload.inbound_ids}
