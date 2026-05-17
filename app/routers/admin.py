import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel
from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel, UserRole
from app.models.ticket import TicketModel
from app.integrations.xui_api import build_xui_client
from app.config import get_settings, Settings

logger = logging.getLogger(__name__)
router = APIRouter()

class UserRoleUpdate(BaseModel):
    role: UserRole

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
