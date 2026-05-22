import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel, UserRole
from app.models.ticket import TicketModel
from app.integrations.xui_api import build_xui_client
from app.config import get_settings, Settings
import httpx
logger = logging.getLogger(__name__)
router = APIRouter()
class UserRoleUpdate(BaseModel):
    role: UserRole
class ReferralSettings(BaseModel):
    layer_1: float = Field(default=5.0, ge=0.0, le=100.0, description="Layer 1 referral percentage")
    layer_2: float = Field(default=3.0, ge=0.0, le=100.0, description="Layer 2 referral percentage")
    layer_3: float = Field(default=2.0, ge=0.0, le=100.0, description="Layer 3 referral percentage")
    layer_4: float = Field(default=1.0, ge=0.0, le=100.0, description="Layer 4 referral percentage")
    layer_5: float = Field(default=0.5, ge=0.0, le=100.0, description="Layer 5 referral percentage")
class SendMessagePayload(BaseModel):
    telegram_id: int = Field(..., description="Target user's Telegram ID")
    message: str = Field(..., min_length=1, description="Message text to send")
class BroadcastPayload(BaseModel):
    message: str = Field(..., min_length=1, description="Broadcast message text")
    target: str = Field(default="all", description="Target group: 'all', 'unpaid_loans', 'active_configs'")
async def _send_telegram_message(bot_token: str, chat_id: int, text: str) -> bool:
    """Send a Telegram message via Bot API."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
            return resp.status_code == 200 and resp.json().get("ok", False)
    except Exception as exc:
        logger.warning("Failed to send Telegram message to %s: %s", chat_id, exc)
        return False
@router.get("/stats", summary="Dashboard statistics")
async def get_stats(
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    total_users = await db.users.count_documents({})
    pipeline = [
        {"$match": {"status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_usd"}}},
    ]
    revenue_cursor = db.payments.aggregate(pipeline)
    revenue_doc = await revenue_cursor.to_list(length=1)
    total_revenue = revenue_doc[0]["total"] if revenue_doc else 0.0
    total_tickets = await db.tickets.count_documents({})
    open_tickets = await db.tickets.count_documents({"status": "open"})
    # Count configs live from XUI
    total_configs = 0
    active_configs = 0
    for server in settings.get_enabled_servers():
        try:
            xui = build_xui_client(server)
            clients = await xui.get_client_info()
            total_configs += len(clients)
            active_configs += sum(1 for c in clients if c.get("enable", True))
        except Exception as exc:
            logger.warning("Stats: could not reach server %s: %s", server.get("name"), exc)
    return {
        "total_users": total_users,
        "active_configs": active_configs,
        "total_configs": total_configs,
        "total_revenue_usd": round(total_revenue, 2),
        "total_tickets": total_tickets,
        "open_tickets": open_tickets,
    }
@router.get("/users/search", summary="Search users by any identifier (admin)")
async def search_users(
    q: str = Query(..., min_length=1, description="Query: telegram_id, nickname, username, phone, or name"),
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[UserModel]:
    """Search across all user fields: telegram_id, nickname, telegram username, phone, name."""
    conditions = []
    # Try numeric match for telegram_id
    try:
        tid = int(q)
        conditions.append({"telegram_id": tid})
    except ValueError:
        pass
    # Text-based matches (case-insensitive regex)
    regex = {"$regex": q, "$options": "i"}
    conditions.extend([
        {"nickname": regex},
        {"telegram_info.username": regex},
        {"telegram_info.first_name": regex},
        {"telegram_info.last_name": regex},
        {"telegram_info.phone_number": regex},
    ])
    query = {"$or": conditions} if conditions else {}
    results = []
    async for doc in db.users.find(query).limit(20):
        doc.pop("_id", None)
        results.append(UserModel(**doc))
    return results
@router.post("/users/send-message", summary="Send a message to a specific user (admin)")
async def send_message_to_user(
    payload: SendMessagePayload,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Send a Telegram message to a specific user by their Telegram ID."""
    # Verify user exists
    user_doc = await db.users.find_one({"telegram_id": payload.telegram_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    if not settings.BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot token not configured")
    success = await _send_telegram_message(settings.BOT_TOKEN, payload.telegram_id, payload.message)
    if not success:
        raise HTTPException(status_code=502, detail="Failed to send message via Telegram Bot API")
    return {"status": "success", "message": f"Message sent to user {payload.telegram_id}"}
@router.post("/users/broadcast", summary="Broadcast message to multiple users (admin)")
async def broadcast_message(
    payload: BroadcastPayload,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Send a broadcast message to:
    - 'all': all users
    - 'unpaid_loans': users with unpaid loans
    - 'active_configs': users with active VPN configs
    """
    if not settings.BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot token not configured")
    target_ids: list[int] = []
    if payload.target == "all":
        async for doc in db.users.find({}, {"telegram_id": 1}):
            if doc.get("telegram_id"):
                target_ids.append(doc["telegram_id"])
    elif payload.target == "unpaid_loans":
        async for doc in db.loans.find({"status": "unpaid"}, {"telegram_id": 1}):
            tid = doc.get("telegram_id")
            if tid and tid not in target_ids:
                target_ids.append(tid)
    elif payload.target == "active_configs":
        # Get all active config emails from XUI servers
        active_tids: set[int] = set()
        for server in settings.get_enabled_servers():
            try:
                xui = build_xui_client(server)
                clients = await xui.get_client_info()
                for c in clients:
                    if c.get("enable", True):
                        email = c.get("email", "")
                        try:
                            tid = int(email.split("-")[0])
                            active_tids.add(tid)
                        except (ValueError, IndexError):
                            pass
            except Exception as exc:
                logger.warning("broadcast active_configs: server error: %s", exc)
        target_ids = list(active_tids)
    else:
        raise HTTPException(status_code=400, detail="Invalid target. Use 'all', 'unpaid_loans', or 'active_configs'")
    if not target_ids:
        return {"status": "success", "sent": 0, "failed": 0, "total": 0, "message": "No users found for target group"}
    sent = 0
    failed = 0
    for tid in target_ids:
        ok = await _send_telegram_message(settings.BOT_TOKEN, tid, payload.message)
        if ok:
            sent += 1
        else:
            failed += 1
    return {
        "status": "success",
        "sent": sent,
        "failed": failed,
        "total": len(target_ids),
        "message": f"Broadcast complete: {sent} sent, {failed} failed out of {len(target_ids)} users"
    }
@router.put("/users/{telegram_id}/role", summary="Change user role (admin)")
async def change_user_role(
    telegram_id: int,
    payload: UserRoleUpdate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
):
    result = await db.users.update_one(
        {"telegram_id": telegram_id},
        {"$set": {"role": payload.role.value}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success", "message": f"User role updated to {payload.role.value}"}
@router.get("/users/{telegram_id}/tickets", response_model=list[TicketModel], summary="Get user's tickets (admin)")
async def get_user_tickets(
    telegram_id: int,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[TicketModel]:
    results = []
    async for doc in db.tickets.find({"telegram_id": telegram_id}):
        doc.pop("_id", None)
        results.append(TicketModel(**doc))
    return results
@router.post("/sync-configs", summary="Test connectivity to all XUI servers and return status")
async def sync_configs(
    _admin: UserModel = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    servers_ok = 0
    servers_failed = 0
    total_clients = 0
    errors = []
    for server in settings.get_server_list():
        server_name = server.get("name", server.get("server_name", ""))
        try:
            xui = build_xui_client(server)
            clients = await xui.get_client_info()
            total_clients += len(clients)
            servers_ok += 1
        except Exception as exc:
            servers_failed += 1
            errors.append(f"{server_name}: connection failed")
            logger.warning("sync_configs error for %s: %s", server_name, exc)
    return {
        "servers_ok": servers_ok,
        "servers_failed": servers_failed,
        "total_clients": total_clients,
        "errors": errors,
    }
@router.get("/referral-settings", response_model=ReferralSettings, summary="Get referral layer percentages (admin)")
async def get_referral_settings(
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> ReferralSettings:
    doc = await db.settings.find_one({"_id": "referral_settings"})
    if doc:
        data = doc.get("data", {})
        return ReferralSettings(
            layer_1=data.get("layer_1", settings.REFERRAL_LAYER_1_PCT),
            layer_2=data.get("layer_2", settings.REFERRAL_LAYER_2_PCT),
            layer_3=data.get("layer_3", settings.REFERRAL_LAYER_3_PCT),
            layer_4=data.get("layer_4", settings.REFERRAL_LAYER_4_PCT),
            layer_5=data.get("layer_5", settings.REFERRAL_LAYER_5_PCT),
        )
    return ReferralSettings(
        layer_1=settings.REFERRAL_LAYER_1_PCT,
        layer_2=settings.REFERRAL_LAYER_2_PCT,
        layer_3=settings.REFERRAL_LAYER_3_PCT,
        layer_4=settings.REFERRAL_LAYER_4_PCT,
        layer_5=settings.REFERRAL_LAYER_5_PCT,
    )
@router.put("/referral-settings", response_model=ReferralSettings, summary="Update referral layer percentages (admin)")
async def update_referral_settings(
    payload: ReferralSettings,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ReferralSettings:
    data = payload.model_dump()
    await db.settings.update_one(
        {"_id": "referral_settings"},
        {"$set": {"data": data}},
        upsert=True,
    )
    return payload
