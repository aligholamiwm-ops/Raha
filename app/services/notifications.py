import logging
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.notification import (
    Notification,
    NotificationCategory,
    NotificationState,
)
from app.utils.telegram import send_telegram_message

logger = logging.getLogger(__name__)

# Maximum notifications per user (can be made configurable via env)
MAX_NOTIFICATIONS_PER_USER = 100


async def notify_user(
    db: AsyncIOMotorDatabase,
    telegram_id: int,
    *,
    category: NotificationCategory,
    title: str,
    message: str,
    severity: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> Notification:
    """Push a single notification to a user's embedded list."""
    notification = Notification(
        category=category,
        title=title,
        message=message,
        severity=severity,
        metadata=metadata or {},
    )

    await db.users.update_one(
        {"telegram_id": telegram_id},
        {"$push": {"notifications": notification.model_dump()}},
    )

    # Cap: trim oldest READ items if over limit
    await _prune_notifications(db, telegram_id)

    logger.debug(
        "Notification %s pushed to user %d", notification.category.value, telegram_id
    )
    return notification


async def notify_users(
    db: AsyncIOMotorDatabase,
    telegram_ids: List[int],
    *,
    category: NotificationCategory,
    title: str,
    message: str,
    severity: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> int:
    """Fan-out a notification to many users. Returns count pushed."""
    pushed = 0
    notification_doc = Notification(
        category=category,
        title=title,
        message=message,
        severity=severity,
        metadata=metadata or {},
    ).model_dump()

    for tid in telegram_ids:
        try:
            await db.users.update_one(
                {"telegram_id": tid},
                {"$push": {"notifications": notification_doc}},
            )
            await _prune_notifications(db, tid)
            pushed += 1
        except Exception as exc:
            logger.warning("Failed to notify user %d: %s", tid, exc)

    logger.info(
        "Notified %d of %d users about %s", pushed, len(telegram_ids), category.value
    )
    return pushed


async def broadcast(
    db: AsyncIOMotorDatabase,
    bot_token: Optional[str],
    *,
    title: str,
    message: str,
    target: str,
    also_send_telegram: bool = True,
) -> dict:
    """Fan-out an announcement as in-app notifications to target users.

    Returns { sent, failed, total }.
    """
    target_ids: List[int] = []

    if target == "all":
        async for doc in db.users.find({}, {"telegram_id": 1}):
            if doc.get("telegram_id"):
                target_ids.append(doc["telegram_id"])
    elif target == "unpaid_loans":
        seen = set()
        async for doc in db.loans.find({"status": "unpaid"}, {"telegram_id": 1}):
            tid = doc.get("telegram_id")
            if tid and tid not in seen:
                seen.add(tid)
                target_ids.append(tid)
    elif target == "active_configs":
        seen = set()
        async for doc in db.loans.find({"status": "unpaid"}, {"telegram_id": 1}):
            tid = doc.get("telegram_id")
            if tid and tid not in seen:
                seen.add(tid)
                target_ids.append(tid)
    else:
        raise ValueError(f"Unknown broadcast target: {target}")

    sent = 0
    failed = 0
    notification_doc = Notification(
        category=NotificationCategory.announcement,
        title=title,
        message=message,
        severity="info",
        metadata={"target": target},
    ).model_dump()

    for tid in target_ids:
        try:
            await db.users.update_one(
                {"telegram_id": tid},
                {"$push": {"notifications": notification_doc}},
            )
            await _prune_notifications(db, tid)
            sent += 1

            if also_send_telegram and bot_token:
                try:
                    await send_telegram_message(bot_token, tid, message)
                except Exception as exc:
                    logger.warning("Telegram broadcast failed for %d: %s", tid, exc)
        except Exception as exc:
            logger.warning("Broadcast push failed for user %d: %s", tid, exc)
            failed += 1

    logger.info("Broadcast '%s' sent: %d/%d (failed: %d)", title, sent, len(target_ids), failed)
    return {"sent": sent, "failed": failed, "total": len(target_ids)}


async def _prune_notifications(
    db: AsyncIOMotorDatabase, telegram_id: int
) -> None:
    """Trim oldest READ notifications when total exceeds MAX_NOTIFICATIONS_PER_USER.
    UNREAD notifications are NEVER deleted — they are always preserved."""
    user_doc = await db.users.find_one(
        {"telegram_id": telegram_id},
        {"notifications": 1},
    )
    if not user_doc:
        return

    items = user_doc.get("notifications", [])
    if len(items) <= MAX_NOTIFICATIONS_PER_USER:
        return

    unread_state = NotificationState.unread.value
    read_state = NotificationState.read.value
    unread_items = [n for n in items if n.get("state") == unread_state]
    read_items = [n for n in items if n.get("state") == read_state]
    keep_count = max(0, MAX_NOTIFICATIONS_PER_USER - len(unread_items))
    kept_read_ids = {n["notification_id"] for n in read_items[-keep_count:]}
    unread_ids = {n["notification_id"] for n in unread_items}
    keep_ids = unread_ids | kept_read_ids

    await db.users.update_one(
        {"telegram_id": telegram_id},
        {
            "$set": {
                "notifications": [
                    n for n in items if n["notification_id"] in keep_ids
                ]
            }
        },
    )
