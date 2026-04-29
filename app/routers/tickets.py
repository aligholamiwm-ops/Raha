from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel
from app.models.ticket import (
    TicketModel,
    TicketCreate,
    TicketUpdate,
    TicketReply,
    TicketStatus,
    TicketMessage,
    SenderRole,
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
    now = datetime.now(timezone.utc)
    ticket = TicketModel(
        telegram_id=current_user.telegram_id,
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
    summary="List all tickets (admin)",
)
async def list_all_tickets(
    status: TicketStatus | None = None,
    skip: int = 0,
    limit: int = 50,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[TicketModel]:
    query = {"status": status.value} if status else {}
    results = []
    async for doc in db.tickets.find(query).skip(skip).limit(limit):
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
    # Non-admins can only view their own tickets
    if (
        current_user.role != "admin"
        and doc["telegram_id"] != current_user.telegram_id
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    doc.pop("_id", None)
    return TicketModel(**doc)


@router.post(
    "/{ticket_id}/reply",
    response_model=TicketModel,
    summary="Reply to a ticket (user or admin)",
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
        current_user.role != "admin"
        and doc["telegram_id"] != current_user.telegram_id
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    if doc["status"] == TicketStatus.closed.value:
        raise HTTPException(status_code=400, detail="Cannot reply to a closed ticket")

    now = datetime.now(timezone.utc)
    sender = SenderRole.admin if current_user.role == "admin" else SenderRole.user
    new_message = TicketMessage(sender_role=sender, text=payload.text, timestamp=now)

    new_status = (
        TicketStatus.waiting_for_user.value
        if current_user.role == "admin"
        else TicketStatus.open.value
    )

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
    summary="Update ticket status (admin)",
)
async def update_ticket_status(
    ticket_id: str,
    payload: TicketUpdate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> TicketModel:
    update_data = payload.to_dict()
    if "status" in update_data:
        update_data["status"] = update_data["status"].value if hasattr(update_data["status"], "value") else update_data["status"]
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
