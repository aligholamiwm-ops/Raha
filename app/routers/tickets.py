from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel, UserRole
from app.models.ticket import (
    TicketModel,
    TicketCreate,
    TicketUpdate,
    TicketReply,
    TicketStatus,
    TicketCategory,
    SortField,
    SortOrder,
    TicketMessage,
    SenderRole,
    USDTNetwork,
)

router = APIRouter()


@router.post(
    "/",
    response_model=TicketModel,
    status_code=201,
    summary="Create support ticket",
)
async def create_ticket(
    payload: TicketCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> TicketModel:
    # Validate withdrawal ticket fields
    if payload.category == TicketCategory.withdrawal:
        if not payload.usdt_address or not payload.usdt_network:
            raise HTTPException(
                status_code=400,
                detail="USDT address and network are required for withdrawal tickets"
            )
    
    now = datetime.now(timezone.utc)
    ticket = TicketModel(
        telegram_id=current_user.telegram_id,
        title=payload.title,
        category=payload.category,
        usdt_address=payload.usdt_address,
        usdt_network=payload.usdt_network,
        messages=[
            TicketMessage(
                sender_role=SenderRole.user,
                text=payload.initial_message,
                timestamp=now,
            )
        ],
        created_at=now,
        updated_at=now,
    )
    await db.tickets.insert_one(ticket.to_dict())
    return ticket


@router.get(
    "/my",
    response_model=list[TicketModel],
    summary="List current user's tickets",
)
async def list_my_tickets(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[TicketModel]:
    results = []
    async for doc in db.tickets.find({"telegram_id": current_user.telegram_id}):
        doc.pop("_id", None)
        results.append(TicketModel(**doc))
    return results


@router.get(
    "/",
    response_model=list[TicketModel],
    summary="List all tickets (admin/support)",
)
async def list_all_tickets(
    status: TicketStatus | None = None,
    category: TicketCategory | None = None,
    sort_by: SortField = Query(SortField.created_at, description="Sort by field"),
    sort_order: SortOrder = Query(SortOrder.desc, description="Sort order"),
    skip: int = 0,
    limit: int = 50,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[TicketModel]:
    # Allow both admin and support to view all tickets
    if current_user.role not in [UserRole.admin, UserRole.support]:
        raise HTTPException(status_code=403, detail="Admin or support access required")
    
    query = {}
    if status:
        query["status"] = status.value
    if category:
        query["category"] = category.value
    
    # Determine sort order
    sort_direction = -1 if sort_order == SortOrder.desc else 1
    
    results = []
    async for doc in db.tickets.find(query).sort(sort_by.value, sort_direction).skip(skip).limit(limit):
        doc.pop("_id", None)
        results.append(TicketModel(**doc))
    return results


@router.get(
    "/{ticket_id}",
    response_model=TicketModel,
    summary="Get ticket by ID",
)
async def get_ticket(
    ticket_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> TicketModel:
    doc = await db.tickets.find_one({"ticket_id": ticket_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket not found")
    # Non-admins and non-support can only view their own tickets
    if (
        current_user.role not in [UserRole.admin, UserRole.support]
        and doc["telegram_id"] != current_user.telegram_id
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    doc.pop("_id", None)
    return TicketModel(**doc)


@router.post(
    "/{ticket_id}/reply",
    response_model=TicketModel,
    summary="Reply to a ticket (user, admin, or support)",
)
async def reply_to_ticket(
    ticket_id: str,
    payload: TicketReply,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> TicketModel:
    doc = await db.tickets.find_one({"ticket_id": ticket_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if (
        current_user.role not in [UserRole.admin, UserRole.support]
        and doc["telegram_id"] != current_user.telegram_id
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    if doc["status"] == TicketStatus.closed.value:
        raise HTTPException(status_code=400, detail="Cannot reply to a closed ticket")

    now = datetime.now(timezone.utc)
    # Determine sender role
    if current_user.role == UserRole.admin:
        sender = SenderRole.admin
    elif current_user.role == UserRole.support:
        sender = SenderRole.support
    else:
        sender = SenderRole.user
    
    new_message = TicketMessage(sender_role=sender, text=payload.text, timestamp=now)

    # Update status based on who replied
    if current_user.role in [UserRole.admin, UserRole.support]:
        new_status = TicketStatus.waiting_for_user.value
    else:
        new_status = TicketStatus.open.value

    result = await db.tickets.find_one_and_update(
        {"ticket_id": ticket_id},
        {
            "$push": {"messages": new_message.model_dump()},
            "$set": {"status": new_status, "updated_at": now},
        },
        return_document=True,
    )
    result.pop("_id", None)
    return TicketModel(**result)


@router.put(
    "/{ticket_id}/status",
    response_model=TicketModel,
    summary="Update ticket status (admin or support)",
)
async def update_ticket_status(
    ticket_id: str,
    payload: TicketUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> TicketModel:
    # Allow both admin and support to update ticket status
    if current_user.role not in [UserRole.admin, UserRole.support]:
        raise HTTPException(status_code=403, detail="Admin or support access required")
    
    update_data = payload.to_dict()
    if "status" in update_data:
        status_val = update_data["status"]
        update_data["status"] = status_val.value if hasattr(status_val, "value") else status_val
    update_data["updated_at"] = datetime.now(timezone.utc)
    result = await db.tickets.find_one_and_update(
        {"ticket_id": ticket_id},
        {"$set": update_data},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Ticket not found")
    result.pop("_id", None)
    return TicketModel(**result)
