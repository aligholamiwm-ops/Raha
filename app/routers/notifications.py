import logging
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel
from app.models.notification import Notification, NotificationState
from app.services.notifications import broadcast as broadcast_service
from app.config import get_settings, Settings

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get(
    "/notifications/me",
    summary="List current user's notifications",
)
async def list_my_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    state: Optional[NotificationState] = None,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    """Get notifications for the authenticated user.
    Returns paginated list ordered by created_at descending plus unread count."""
    user_doc = await db.users.find_one(
        {"telegram_id": current_user.telegram_id},
        {"notifications": 1},
    )
    if not user_doc:
        return {"unread_count": 0, "total": 0, "notifications": []}

    items = list(user_doc.get("notifications", []))
    items.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    total_before_filters = len(items)
    if state:
        items = [n for n in items if n.get("state") == state.value]

    total = len(items)
    unread_state = NotificationState.unread.value
    unread_count = sum(1 for n in items if n.get("state") == unread_state)
    page = items[skip:skip + limit]

    # Convert to Notification objects for serialization
    notifications = []
    for item in page:
        notif = Notification(**item)
        notifications.append(notif.model_dump())

    return {
        "unread_count": unread_count,
        "total": total,
        "total_before_filters": total_before_filters,
        "notifications": notifications,
    }


@router.get(
    "/notifications/me/{notification_id}",
    summary="Get single notification detail",
)
async def get_notification(
    notification_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> Notification:
    user_doc = await db.users.find_one(
        {"telegram_id": current_user.telegram_id},
        {"notifications": 1},
    )
    if not user_doc:
        raise HTTPException(status_code=404, detail="No notifications found")

    for item in user_doc.get("notifications", []):
        if item.get("notification_id") == notification_id:
            return Notification(**item)

    raise HTTPException(status_code=404, detail="Notification not found")


@router.put(
    "/notifications/me/{notification_id}/read",
    summary="Mark a notification as read",
)
async def mark_notification_read(
    notification_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> Notification:
    result = await db.users.find_one_and_update(
        {
            "telegram_id": current_user.telegram_id,
            "notifications.notification_id": notification_id,
        },
        {
            "$set": {
                "notifications.$.state": NotificationState.read.value,
                "notifications.$.read_at": datetime.now(timezone.utc),
            }
        },
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    for item in result.get("notifications", []):
        if item.get("notification_id") == notification_id:
            return Notification(**item)
    raise HTTPException(status_code=404, detail="Notification not found")


@router.put(
    "/notifications/me/read-all",
    summary="Mark all user's notifications as read",
)
async def mark_all_notifications_read(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    result = await db.users.update_one(
        {"telegram_id": current_user.telegram_id},
        {
            "$set": {
                "notifications.$[elem].state": NotificationState.read.value,
                "notifications.$[elem].read_at": datetime.now(timezone.utc),
            }
        },
        array_filters=[{"elem.state": NotificationState.unread.value}],
    )
    return {"updated": result.modified_count}


@router.delete(
    "/notifications/me/{notification_id}",
    status_code=204,
    summary="Delete a single notification",
)
async def delete_notification(
    notification_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    result = await db.users.update_one(
        {"telegram_id": current_user.telegram_id},
        {"$pull": {"notifications": {"notification_id": notification_id}}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")


@router.delete(
    "/notifications/me",
    status_code=204,
    summary="Delete multiple notifications",
)
async def clear_notifications(
    only: Optional[str] = Query(
        default=None, description="'read' to delete only read notifications"
    ),
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    if only == "read":
        await db.users.update_one(
            {"telegram_id": current_user.telegram_id},
            {"$pull": {"notifications": {"state": NotificationState.read.value}}},
        )
    else:
        await db.users.update_one(
            {"telegram_id": current_user.telegram_id},
            {"$set": {"notifications": []}},
        )


# ── Admin announcement endpoints ──────────────────────────────────────


@router.post(
    "/admin/announcements",
    summary="Create a broadcast announcement (admin)",
)
async def create_announcement(
    payload: dict,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Create and broadcast an announcement to target users.
    Payload: { title, message, target, send_as_notification, send_via_telegram }
    """
    title = payload.get("title", "Announcement")
    message = payload.get("message", "")
    target = payload.get("target", "all")
    send_as_notification = payload.get("send_as_notification", True)
    send_via_telegram = payload.get("send_via_telegram", True)

    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    if not send_as_notification and not send_via_telegram:
        raise HTTPException(status_code=400, detail="At least one delivery channel must be selected")

    bot_token = settings.BOT_TOKEN if send_via_telegram else None

    result = await broadcast_service(
        db, bot_token,
        title=title,
        message=message,
        target=target,
        send_as_notification=send_as_notification,
        send_via_telegram=send_via_telegram,
    )
    return result
