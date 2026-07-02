# Notification System — Build Plan

## Overview

Implement a complete in-app notification center with embedded notification objects on the User document, admin broadcast capability (persisted announcements), and a professional notification dropdown/panel on the frontend. Wire every event action (announcement, deposit, withdraw, loan action, purchase plan, referral action, support action, etc.) to generate notifications.

---

## Architecture summary

- **Backend**: FastAPI + MongoDB + Motor async
- **Frontend**: React 18 + Vite + Tailwind CSS + react-icons (Feather)
- **Data**: Embedded `notifications: List[Notification]` on the `users` document + separate `db.announcements` collection for broadcasts
- **Auth**: Telegram Mini App init-data HMAC + optional admin 2FA password
- **Storage env**: `.env` with `NOTIFICATIONS_MAX_PER_USER=100` (default)

---

## Instructions for reading this plan

Each **Step** can be dispatched to a **subagent** (`task subagent_type="general"`). Steps are in dependency order. Steps that are fully independent can be run in parallel. Each subagent must:

1. Read the relevant existing files first (using Read tool).
2. Understand existing conventions (coding style, imports, naming).
3. Write the code.
4. Verify with lint (flake8/pylint for Python, ESLint for JS) if available.

---

## PRE-BUILD HOOK

Before any step below, run:

```bash
git checkout -b feature/notification-system
```

This ensures all changes are tracked in a dedicated branch.

After every Step completes, commit:

```bash
git add -A && git commit -m "<step description>"
```

---

## Step 0 — Project-wide conventions & reference data

### Reference files to read before starting any code:

**Backend conventions:**
- `app/models/user.py` — UserModel with embedded submodels (ReferralInfo, TelegramInfo), pattern for enums, Field defaults, `to_dict()`.
- `app/models/ticket.py` — TicketModel, TicketMessage, SenderRole, patterns for uuid, datetime, enums.
- `app/models/payment.py` — PaymentModel, PaymentStatus, PaymentType, for_plan() / for_loan() classmethods.
- `app/models/__init__.py` — export list pattern.
- `app/database.py` — `_create_indexes()` index creation pattern.
- `app/routers/admin.py` — `_send_telegram_message()` helper at lines 32-41 (will be moved to utils).
- `app/routers/payments.py` — `_distribute_referral_bonuses()` at lines 35-108 (where referral bonus notification injection happens).
- `app/routers/loans.py` — allocate_loan, pay_loan endpoints.
- `app/routers/tickets.py` — create_ticket, reply_to_ticket, update_ticket_status endpoints.
- `app/main.py` — how routers are registered (e.g., `app.include_router(router, prefix=...)`).

**Frontend conventions:**
- `frontend/src/App.jsx` — Header with existing FiBell button (lines 71-85), AppShell layout, routing.
- `frontend/src/context/AppContext.jsx` — Context creation pattern (createContext, useState, useCallback, Provider pattern).
- `frontend/src/components/BottomNav.jsx` — icon component pattern, react-router NavLink usage.
- `frontend/src/pages/Admin.jsx` — existing broadcast tab (lines 1451-1514), toast system, card/button patterns.
- `frontend/src/api/client.js` — axios instance, interceptors, exported API functions pattern.
- `frontend/src/pages/Profile.jsx` — modal pattern (NicknameModal), BuyConfirmModal.

---

## Step 1 — Backend: Notification & Announcement models

**SUBAGENT 1 — Create `app/models/notification.py`**

Read `app/models/user.py`, `app/models/ticket.py`, `app/models/loan.py`, `app/models/payment.py` first to match the coding conventions.

Create `app/models/notification.py` containing:

```python
from enum import Enum
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field
import uuid


class NotificationCategory(str, Enum):
    announcement    = "announcement"
    deposit         = "deposit"
    withdraw        = "withdraw"
    loan_allocated  = "loan_allocated"
    loan_settled    = "loan_settled"
    plan_purchased  = "plan_purchased"
    referral_bonus  = "referral_bonus"
    support_replied = "support_replied"
    ticket_status   = "ticket_status"


class NotificationState(str, Enum):
    unread = "unread"
    read   = "read"


class Notification(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    notification_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: NotificationCategory
    title: str
    message: str
    state: NotificationState = NotificationState.unread
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    read_at: Optional[datetime] = None
    severity: Optional[str] = Field(default=None, description="info|success|warning|error")
    metadata: Optional[dict] = Field(default_factory=dict, 
        description="Category-specific extras: amount_usd, plan_name, ticket_id, loan_id, etc.")
    announcement_id: Optional[str] = Field(default=None,
        description="Set when category=announcement, links to Announcement collection")

    def mark_read(self) -> None:
        self.state = NotificationState.read
        self.read_at = datetime.now(timezone.utc)
```

**SUBAGENT 2 — Create `app/models/announcement.py`**

Read `app/models/payment.py` first for uuid and datetime patterns.

Create `app/models/announcement.py`:

```python
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field
import uuid


class Announcement(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    announcement_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    message: str
    target: str = Field(default="all", 
        description="Target group: 'all' | 'unpaid_loans' | 'active_configs'")
    audience_count: int = 0
    delivered_count: int = 0
    failed_count: int = 0
    created_by: int = Field(..., description="Admin telegram_id who created this")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return self.model_dump()
```

**SUBAGENT 3 — Add `notifications` field to UserModel**

Read `app/models/user.py`, then add to `UserModel`:

```python
from app.models.notification import Notification

# Inside UserModel, add:
notifications: List[Notification] = Field(default_factory=list, 
    description="In-app notifications list (latest first, capped)")
```

**SUBAGENT 4 — Update `app/models/__init__.py`**

Read then edit to export:

```python
from app.models.notification import Notification, NotificationCategory, NotificationState
from app.models.announcement import Announcement
```

Add to `__all__`.

**SUBAGENT 5 — Update `app/database.py` indexes**

Read then add indices:

```python
await db.announcements.create_index("announcement_id", unique=True)
await db.announcements.create_index("created_at")
```

---

## Step 2 — Backend: Shared telegram utility + notification service

**SUBAGENT 6 — Create `app/utils/telegram.py`**

Read `app/routers/admin.py` lines 32-41 (`_send_telegram_message` function).

Create `app/utils/telegram.py`:

```python
import logging
import httpx

logger = logging.getLogger(__name__)


async def send_telegram_message(bot_token: str, chat_id: int, text: str) -> bool:
    """Send a Telegram message via Bot API. Shared helper."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url, 
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            )
            return resp.status_code == 200 and resp.json().get("ok", False)
    except Exception as exc:
        logger.warning("Failed to send Telegram message to %s: %s", chat_id, exc)
        return False
```

Then in `app/routers/admin.py`:
- Remove the old `_send_telegram_message` function definition
- Add `from app.utils.telegram import send_telegram_message`
- Replace all calls to `_send_telegram_message(...)` with `send_telegram_message(...)`

**SUBAGENT 7 — Create `app/services/notifications.py`**

Read `app/models/notification.py`, `app/models/announcement.py`, `app/models/user.py`, `app/database.py`, `app/utils/telegram.py`.

This is the core service. Must be written carefully.

Create `app/services/notifications.py`:

```python
import logging
from typing import Optional, List
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.notification import Notification, NotificationCategory, NotificationState
from app.models.announcement import Announcement
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
    announcement_id: Optional[str] = None,
) -> Notification:
    """Push a single notification to a user's embedded list."""
    notification = Notification(
        category=category,
        title=title,
        message=message,
        severity=severity,
        metadata=metadata or {},
        announcement_id=announcement_id,
    )

    await db.users.update_one(
        {"telegram_id": telegram_id},
        {"$push": {"notifications": notification.model_dump()}},
    )

    # Cap: trim oldest READ items if over limit
    await _prune_notifications(db, telegram_id)

    logger.debug("Notification %s pushed to user %d", notification.category.value, telegram_id)
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

    logger.info("Notified %d of %d users about %s", pushed, len(telegram_ids), category.value)
    return pushed


async def broadcast(
    db: AsyncIOMotorDatabase,
    bot_token: Optional[str],
    *,
    title: str,
    message: str,
    target: str,
    created_by: int,
    also_send_telegram: bool = True,
) -> dict:
    """Create an Announcement record and fan-out as in-app notifications.

    Returns { announcement_id, sent, failed, total }.
    """
    # Determine target audience
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
        # Note: we reuse the above but ideally should check XUI for active configs.
        # For now same as loan check; actual XUI check can be added later.
    else:
        raise ValueError(f"Unknown broadcast target: {target}")

    # Create announcement record
    announcement = Announcement(
        title=title,
        message=message,
        target=target,
        audience_count=len(target_ids),
        created_by=created_by,
    )

    announcement_data = announcement.to_dict()
    await db.announcements.insert_one(announcement_data)

    # Fan out in-app notifications
    sent = 0
    failed = 0
    notification_doc = Notification(
        category=NotificationCategory.announcement,
        title=title,
        message=message,
        announcement_id=announcement.announcement_id,
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

            # Also send via Telegram Bot API if configured
            if also_send_telegram and bot_token:
                try:
                    ok = await send_telegram_message(bot_token, tid, message)
                    if ok:
                        pass  # telemetry if desired
                except Exception as exc:
                    logger.warning("Telegram broadcast failed for %d: %s", tid, exc)
        except Exception as exc:
            logger.warning("Broadcast push failed for user %d: %s", tid, exc)
            failed += 1

    # Update announcement record with delivery stats
    await db.announcements.update_one(
        {"announcement_id": announcement.announcement_id},
        {"$set": {"delivered_count": sent, "failed_count": failed}},
    )

    logger.info("Broadcast '%s' sent: %d/%d (failed: %d)", title, sent, len(target_ids), failed)
    return {
        "announcement_id": announcement.announcement_id,
        "sent": sent,
        "failed": failed,
        "total": len(target_ids),
    }


async def _prune_notifications(db: AsyncIOMotorDatabase, telegram_id: int) -> None:
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

    unread_items = [n for n in items if n.get("state") == NotificationState.unread.value]
    read_items = [n for n in items if n.get("state") == NotificationState.read.value]
    keep_count = max(0, MAX_NOTIFICATIONS_PER_USER - len(unread_items))
    kept_read_ids = {n["notification_id"] for n in read_items[-keep_count:]}
    unread_ids = {n["notification_id"] for n in unread_items}
    keep_ids = unread_ids | kept_read_ids

    await db.users.update_one(
        {"telegram_id": telegram_id},
        {"$set": {"notifications": [n for n in items if n["notification_id"] in keep_ids]}},
    )
```

---

## Step 3 — Backend: Notifications router (API endpoints)

**SUBAGENT 8 — Create `app/routers/notifications.py`**

Read `app/routers/tickets.py`, `app/routers/admin.py`, `app/dependencies.py`, `app/models/notification.py`, `app/services/notifications.py`.

Create `app/routers/notifications.py`:

```python
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel
from app.models.notification import Notification, NotificationCategory, NotificationState
from app.models.announcement import Announcement
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
    unread_count = sum(1 for n in items if n.get("state") == NotificationState.unread.value)
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
        projection={"notifications.$": 1},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Notification not found")
    return Notification(**result["notifications"][0])


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
    only: Optional[str] = Query(default=None, description="'read' to delete only read notifications"),
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
    Payload: { title, message, target, also_send_telegram }
    """
    title = payload.get("title", "Announcement")
    message = payload.get("message", "")
    target = payload.get("target", "all")
    also_send_telegram = payload.get("also_send_telegram", True)

    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    bot_token = settings.BOT_TOKEN if also_send_telegram else None

    result = await broadcast_service(
        db, bot_token,
        title=title,
        message=message,
        target=target,
        created_by=_admin.telegram_id,
        also_send_telegram=also_send_telegram,
    )
    return result


@router.get(
    "/admin/announcements",
    summary="List past announcements (admin)",
)
async def list_announcements(
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    results = []
    async for doc in db.announcements.find(
        {},
        {"_id": 0},
    ).sort("created_at", -1).skip(skip).limit(limit):
        results.append(Announcement(**doc))

    total = await db.announcements.count_documents({})
    return {"total": total, "announcements": [a.to_dict() for a in results]}
```

**SUBAGENT 9 — Register the router in `app/main.py`**

Read `app/main.py`, find where other routers are registered (e.g., `app.include_router(...)`), and add:

```python
from app.routers.notifications import router as notifications_router
app.include_router(notifications_router, prefix="/api/v1", tags=["notifications"])
```

---

## Step 4 — Backend: Wire event notifications (THE CRITICAL INTEGRATION STEP)

**SUBAGENT 10 — Wire payment events (deposit, plan purchase, referral bonus)**

Read the full `app/routers/payments.py`.

Inject notification calls at these exact locations:

1. **Wallet plan purchase** — After line 165 (`await _distribute_referral_bonuses(...)`):
   ```python
   await notify_user(
       db, current_user.telegram_id,
       category=NotificationCategory.plan_purchased,
       title="Plan purchased",
       message=f"{payload.plan_name} purchased for ${final_price:.2f} – +{traffic_gb} GB traffic",
       severity="success",
       metadata={
           "plan_name": payload.plan_name,
           "amount_usd": final_price,
           "traffic_gb": traffic_gb,
           "payment_method": "wallet",
       },
   )
   ```

2. **Crypto plan purchase (webhook, traffic > 0)** — After line 400 (`$inc: traffic_balance_gb`):
   ```python
   await notify_user(
       db, telegram_id,
       category=NotificationCategory.plan_purchased,
       title="Plan purchased via crypto",
       message=f"Plan purchased – +{traffic_gb} GB traffic added",
       severity="success",
       metadata={
           "amount_usd": amount_usd,
           "traffic_gb": traffic_gb,
           "payment_method": "crypto",
       },
   )
   ```

3. **Wallet deposit (webhook, traffic = 0, wallet credit)** — After line 410 (`$inc: wallet_balance_usd`):
   ```python
   await notify_user(
       db, telegram_id,
       category=NotificationCategory.deposit,
       title="Wallet deposit received",
       message=f"${amount_usd:.2f} USDT deposited to your wallet",
       severity="success",
       metadata={"amount_usd": amount_usd},
   )
   ```

4. **Referral bonus recorded** — Inside `_distribute_referral_bonuses` after each `$push` at line 98:
   ```python
   await notify_user(
       db, current_referrer_id,
       category=NotificationCategory.referral_bonus,
       title="Referral bonus earned",
       message=f"Layer {layer} bonus: +{bonus:.4f} {'USDT' if benefit_type == ReferralBenefitType.usdt else 'GB'} from referral",
       severity="info",
       metadata={
           "referred_id": buyer_telegram_id,
           "layer": layer,
           "amount": bonus,
           "benefit_type": benefit_type.value if hasattr(benefit_type, 'value') else benefit_type,
       },
   )
   ```
   Note: need to import `notify_user` and `NotificationCategory` at top of file.
   Also need to handle the async context — `_distribute_referral_bonuses` is already async so this is fine.

**SUBAGENT 11 — Wire loan events**

Read `app/routers/loans.py`. Inject at:

1. **After loan allocated + wallet credited** — End of `allocate_loan` (after `$inc` at line 144):
   ```python
   await notify_user(
       db, payload.telegram_id,
       category=NotificationCategory.loan_allocated,
       title="Loan allocated",
       message=f"Loan of ${payload.amount_usdt:.2f} USDT has been credited to your wallet.{f' Note: {payload.note}' if payload.note else ''}",
       severity="info",
       metadata={"amount_usdt": payload.amount_usdt, "loan_id": new_loan.loan_id, "note": payload.note},
   )
   ```

2. **After loan settled via webhook** — In `payments.py` loan branch (after line 384):
   Actually this is in `payments.py` not `loans.py`. Add inside the loan settlement block in `payment_webhook` (after line 383):
   ```python
   await notify_user(
       db, telegram_id,
       category=NotificationCategory.loan_settled,
       title="Loan settled",
       message=f"Loan of ${amount_usd:.2f} USDT has been fully settled. Thank you!",
       severity="success",
       metadata={"amount_usd": amount_usd, "loan_id": loan_id},
   )
   ```

**SUBAGENT 12 — Wire ticket events**

Read `app/routers/tickets.py`. Inject at:

1. **After ticket created** — After `insert_one` at line 65:
   ```python
   await notify_user(
       db, current_user.telegram_id,
       category=NotificationCategory.support_replied,
       title="Ticket created",
       message=f"Support ticket '{payload.title}' has been created. We will get back to you shortly.",
       severity="info",
       metadata={
           "ticket_id": ticket.ticket_id,
           "category": payload.category.value if hasattr(payload.category, 'value') else payload.category,
       },
   )
   ```

2. **After admin/support replies** — After `find_one_and_update` at line 207:
   Check if current_user is admin or support, then notify the ticket owner:
   ```python
   if current_user.role in [UserRole.admin, UserRole.support]:
       ticket_owner_id = result.get("telegram_id")
       if ticket_owner_id != current_user.telegram_id:
           await notify_user(
               db, ticket_owner_id,
               category=NotificationCategory.support_replied,
               title="Support replied to your ticket",
               message=f"Admin replied to '{result.get('title', '')}': {payload.text[:100]}",
               severity="info",
               metadata={"ticket_id": result.get("ticket_id"), "reply_preview": payload.text[:200]},
           )
   ```

3. **After ticket status changed** — After `find_one_and_update` at line 237:
   ```python
   if result.get("telegram_id") != current_user.telegram_id:
       await notify_user(
           db, result["telegram_id"],
           category=NotificationCategory.ticket_status,
           title=f"Ticket {payload.status.value if hasattr(payload.status, 'value') else payload.status}",
           message=f"Ticket '{result.get('title', '')}' status updated to {payload.status.value if hasattr(payload.status, 'value') else payload.status}",
           severity="info" if payload.status in [TicketStatus.closed] else "success",
           metadata={"ticket_id": result.get("ticket_id"), "status": payload.status.value if hasattr(payload.status, 'value') else payload.status},
       )
   ```

**IMPORTANT:**
After wiring each event, add the required imports at the top of each router file:
```python
from app.models.notification import NotificationCategory
from app.services.notifications import notify_user
```

For the payment router:
```python
from app.models.notification import NotificationCategory
from app.services.notifications import notify_user
```

For the loans router:
```python
from app.models.notification import NotificationCategory
from app.services.notifications import notify_user
```

For the tickets router:
```python
from app.models.notification import NotificationCategory
from app.services.notifications import notify_user
```

---

## Step 5 — Backend: Fix admin.py broadcast endpoint

**SUBAGENT 13 — Update admin.py**

Read `app/routers/admin.py`.

- Replace `_send_telegram_message` import/definition with `from app.utils.telegram import send_telegram_message`.
- Keep the old `/admin/users/broadcast` endpoint as-is for backward compatibility (it sends via Telegram only).
- No other changes needed; the new notifications API router handles the announcement flow.

Ensure the `from app.utils.telegram import send_telegram_message` import is present and the old local function is removed.

---

## Step 6 — Frontend: API client additions

**SUBAGENT 14 — Add notification API calls to client.js**

Read `frontend/src/api/client.js`.

Add at the end (before `export default api`):

```javascript
// ── Notifications ───────────────────────────────────────────────────
export const getMyNotifications = (params) =>
  api.get('/api/v1/notifications/me', { params }).then(r => r.data)
export const getNotificationById = (id) =>
  api.get('/api/v1/notifications/me/' + id).then(r => r.data)
export const markNotificationRead = (id) =>
  api.put('/api/v1/notifications/me/' + id + '/read').then(r => r.data)
export const markAllNotificationsRead = () =>
  api.put('/api/v1/notifications/me/read-all').then(r => r.data)
export const deleteNotification = (id) =>
  api.delete('/api/v1/notifications/me/' + id).then(r => r.data)
export const clearReadNotifications = () =>
  api.delete('/api/v1/notifications/me?only=read').then(r => r.data)

// ── Admin Announcements ─────────────────────────────────────────────
export const listAnnouncements = (params) =>
  api.get('/api/v1/admin/announcements', { params }).then(r => r.data)
export const postAnnouncement = (payload) =>
  api.post('/api/v1/admin/announcements', payload).then(r => r.data)
```

---

## Step 7 — Frontend: Notifications context

**SUBAGENT 15 — Create `frontend/src/context/NotificationsContext.jsx`**

Read `frontend/src/context/AppContext.jsx` for the provider pattern, hooks, and usage.

Create `frontend/src/context/NotificationsContext.jsx`:

```jsx
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { getMyNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, clearReadNotifications } from '../api/client'
import { useApp } from './AppContext'

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const { user } = useApp()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  const fetchList = useCallback(async (stateFilter) => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const params = { limit: 50 }
      if (stateFilter) params.state = stateFilter
      const data = await getMyNotifications(params)
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
      setTotal(data.total || 0)
    } catch (e) {
      setError('Failed to load notifications')
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [user])

  const markRead = useCallback(async (id) => {
    try {
      await markNotificationRead(id)
      setNotifications(prev =>
        prev.map(n =>
          n.notification_id === id
            ? { ...n, state: 'read', read_at: new Date().toISOString() }
            : n
        )
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (e) {
      console.error('Failed to mark notification read', e)
    }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead()
      setNotifications(prev => prev.map(n => ({ ...n, state: 'read', read_at: n.read_at || new Date().toISOString() })))
      setUnreadCount(0)
    } catch (e) {
      console.error('Failed to mark all read', e)
    }
  }, [])

  const removeNotification = useCallback(async (id) => {
    try {
      await deleteNotification(id)
      const removed = notifications.find(n => n.notification_id === id)
      setNotifications(prev => prev.filter(n => n.notification_id !== id))
      if (removed?.state === 'unread') {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
      setTotal(prev => Math.max(0, prev - 1))
    } catch (e) {
      console.error('Failed to delete notification', e)
    }
  }, [notifications])

  const clearRead = useCallback(async () => {
    try {
      await clearReadNotifications()
      setNotifications(prev => prev.filter(n => n.state === 'unread'))
      // total = remaining (all unread)
      setTotal(prev => {
        const remaining = notifications.filter(n => n.state === 'unread').length
        return remaining
      })
    } catch (e) {
      console.error('Failed to clear read notifications', e)
    }
  }, [notifications])

  // Auto-fetch after user loads
  useEffect(() => {
    if (user) {
      fetchList()
    }
  }, [user, fetchList])

  // Poll every 30 seconds
  useEffect(() => {
    if (!user) return
    pollRef.current = setInterval(() => {
      fetchList()
    }, 30000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [user, fetchList])

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        total,
        loading,
        error,
        fetchList,
        markRead,
        markAllRead,
        removeNotification,
        clearRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider')
  return ctx
}
```

---

## Step 8 — Frontend: NotificationBell component (the dropdown)

**SUBAGENT 16 — Create `frontend/src/components/NotificationBell.jsx`**

Read `frontend/src/components/BottomNav.jsx` for icon/SVG patterns, `frontend/src/pages/Profile.jsx` for modal patterns, `frontend/src/App.jsx` for the Header layout.

Create `frontend/src/components/NotificationBell.jsx`:

```jsx
import React, { useState, useEffect, useRef } from 'react'
import { FiBell, FiCheck, FiX, FiTrash2, FiRadio, FiArrowDown, FiArrowUp, FiCreditCard, FiShoppingCart, FiUsers, FiMessageSquare, FiClock } from 'react-icons/fi'
import { useNotifications } from '../context/NotificationsContext'

const CATEGORY_ICONS = {
  announcement:    { icon: FiRadio,       color: 'text-violet-400' },
  deposit:         { icon: FiArrowDown,   color: 'text-emerald-400' },
  withdraw:        { icon: FiArrowUp,     color: 'text-amber-400' },
  loan_allocated:  { icon: FiCreditCard,  color: 'text-rose-400' },
  loan_settled:    { icon: FiCreditCard,  color: 'text-emerald-400' },
  plan_purchased:  { icon: FiShoppingCart, color: 'text-blue-400' },
  referral_bonus:  { icon: FiUsers,       color: 'text-cyan-400' },
  support_replied: { icon: FiMessageSquare, color: 'text-indigo-400' },
  ticket_status:   { icon: FiMessageSquare, color: 'text-slate-400' },
}

const DEFAULT_ICON = { icon: FiBell, color: 'text-slate-400' }

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function NotificationBell() {
  const { notifications, unreadCount, loading, fetchList, markRead, markAllRead, removeNotification } = useNotifications()
  const [open, setOpen] = useState(false)
  const [detailNotif, setDetailNotif] = useState(null)
  const bellRef = useRef(null)
  const panelRef = useRef(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (bellRef.current && !bellRef.current.contains(e.target) &&
          panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Fetch fresh when opening
  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next) fetchList()
  }

  const handleRowClick = (notif) => {
    setDetailNotif(notif)
    if (notif.state === 'unread') {
      markRead(notif.notification_id)
    }
  }

  return (
    <>
      <div ref={bellRef} className="relative">
        <button
          onClick={handleToggle}
          className="p-2 text-gray-400 hover:text-white rounded-icon-btn hover:bg-white/5 transition-all active:scale-[0.98] relative"
        >
          <FiBell size={16} />
          {unreadCount > 0 && (
            <>
              <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full" />
              <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[8px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="fixed top-12 left-1/2 -translate-x-1/2 w-[calc(100%-16px)] max-w-[440px] max-h-[60vh] bg-dark-card border border-white/10 rounded-2xl shadow-2xl z-[200] flex flex-col overflow-hidden animate-in slide-in-from-top-2 duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
            <h3 className="text-white font-bold text-sm">
              Notifications
              {unreadCount > 0 && <span className="text-rose-400 ml-1.5 text-[11px]">({unreadCount} new)</span>}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 disabled:text-slate-600 disabled:cursor-not-allowed font-semibold"
              >
                Mark all read
              </button>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-white transition-colors">
                <FiX size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading && notifications.length === 0 && (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                <FiBell size={28} className="mb-2 opacity-50" />
                <p className="text-xs">No notifications yet</p>
              </div>
            )}

            {notifications.length > 0 && (
              <div className="divide-y divide-white/5">
                {notifications.map((n) => {
                  const iconDef = CATEGORY_ICONS[n.category] || DEFAULT_ICON
                  const Icon = iconDef.icon
                  const isUnread = n.state === 'unread'
                  return (
                    <button
                      key={n.notification_id}
                      onClick={() => handleRowClick(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors flex items-start gap-3 ${
                        isUnread ? 'border-l-2 border-emerald-500' : 'opacity-70'
                      }`}
                    >
                      <div className={`mt-0.5 ${isUnread ? iconDef.color : 'text-slate-500'}`}>
                        <Icon size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] font-semibold truncate ${isUnread ? 'text-white' : 'text-slate-400'}`}>
                          {n.title}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{n.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <FiClock size={9} className="text-slate-600" />
                          <span className="text-[9px] text-slate-600">{relativeTime(n.created_at)}</span>
                          {n.severity && (
                            <span className={`text-[8px] font-semibold uppercase ${
                              n.severity === 'success' ? 'text-emerald-500' :
                              n.severity === 'warning' ? 'text-amber-500' :
                              n.severity === 'error' ? 'text-rose-500' :
                              'text-slate-500'
                            }`}>
                              {n.severity}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeNotification(n.notification_id) }}
                        className="p-1 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Delete"
                      >
                        <FiX size={12} />
                      </button>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailNotif && (
        <NotificationDetail
          notification={detailNotif}
          onClose={() => setDetailNotif(null)}
          onDelete={(id) => {
            removeNotification(id)
            setDetailNotif(null)
          }}
        />
      )}
    </>
  )
}

function NotificationDetail({ notification, onClose, onDelete }) {
  const { markRead } = useNotifications()
  const iconDef = CATEGORY_ICONS[notification.category] || DEFAULT_ICON
  const Icon = iconDef.icon

  const handleMarkRead = async () => {
    await markRead(notification.notification_id)
    // Mark the local state as read
    notification.state = 'read'
  }

  // Pretty-print metadata if available
  const metaLines = []
  if (notification.metadata) {
    const m = notification.metadata
    if (m.amount_usd) metaLines.push(`Amount: $${m.amount_usd}`)
    if (m.traffic_gb) metaLines.push(`Traffic: ${m.traffic_gb} GB`)
    if (m.plan_name) metaLines.push(`Plan: ${m.plan_name}`)
    if (m.loan_id) metaLines.push(`Loan ID: ${m.loan_id}`)
    if (m.ticket_id) metaLines.push(`Ticket: ${m.ticket_id}`)
    if (m.layer) metaLines.push(`Referral layer: ${m.layer}`)
    if (m.payment_method) metaLines.push(`Method: ${m.payment_method}`)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[300] px-6" onClick={onClose}>
      <div
        className="bg-dark-card border border-white/10 rounded-2xl p-5 w-full max-w-sm space-y-4 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${notification.state === 'unread' ? 'bg-emerald-500/10' : 'bg-slate-800'}`}>
              <Icon size={18} className={notification.state === 'unread' ? iconDef.color : 'text-slate-500'} />
            </div>
            <div>
              <h3 className="text-white font-bold text-[15px]">{notification.title}</h3>
              <p className="text-[10px] text-slate-500">
                {new Date(notification.created_at).toLocaleString()}
                {notification.severity && (
                  <span className={`ml-2 font-semibold ${
                    notification.severity === 'success' ? 'text-emerald-500' :
                    notification.severity === 'warning' ? 'text-amber-500' :
                    notification.severity === 'error' ? 'text-rose-500' :
                    'text-slate-500'
                  }`}>
                    · {notification.severity.toUpperCase()}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors">
            <FiX size={18} />
          </button>
        </div>

        <div className="bg-white/[0.03] rounded-xl p-3.5">
          <p className="text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap">
            {notification.message}
          </p>
        </div>

        {metaLines.length > 0 && (
          <div className="bg-white/[0.03] rounded-xl p-3.5 space-y-1">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Details</p>
            {metaLines.map((line, i) => (
              <div key={i} className="text-[12px] text-slate-400">{line}</div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          {notification.state === 'unread' && (
            <button
              onClick={handleMarkRead}
              className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <FiCheck size={14} />
              Mark as read
            </button>
          )}
          <button
            onClick={() => onDelete(notification.notification_id)}
            className="py-2.5 bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 font-semibold rounded-xl text-xs transition-colors px-4"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

## Step 9 — Frontend: Wire up NotificationBell in App.jsx

**SUBAGENT 17 — Update `frontend/src/App.jsx`**

Read `frontend/src/App.jsx`.

1. Import `NotificationsProvider` and `NotificationBell`:
   ```jsx
   import { NotificationsProvider } from './context/NotificationsContext'
   import NotificationBell from './components/NotificationBell'
   ```

2. Replace the bare bell button in `Header()`:
   ```jsx
   // OLD:
   <button className="p-2 text-gray-400 hover:text-white rounded-icon-btn hover:bg-white/5 transition-all active:scale-[0.98]">
     <FiBell size={16} />
   </button>
   
   // NEW:
   <NotificationBell />
   ```

3. Remove the `FiBell` import if it's no longer used directly. Keep `FiGlobe`.

4. Wrap the `<AppShell />` inside `<NotificationsProvider>`:
   ```jsx
   export default function App() {
     // ... existing useEffect ...
     return (
       <AppProvider>
         <NotificationsProvider>
           <AppShell />
         </NotificationsProvider>
       </AppProvider>
     )
   }
   ```

---

## Step 10 — Frontend: Update Admin broadcast tab

**SUBAGENT 18 — Update `frontend/src/pages/Admin.jsx`**

Read the full Admin.jsx, especially lines 1451-1514 (broadcast tab).

Modify the broadcast tab to use the new `/api/v1/admin/announcements` endpoint AND add announcement history:

1. Add imports:
   ```jsx
   import { listAnnouncements, postAnnouncement } from '../api/client'
   ```

2. Add state:
   ```jsx
   const [broadcastTitle, setBroadcastTitle] = useState('')
   const [alsoSendTelegram, setAlsoSendTelegram] = useState(true)
   const [showHistory, setShowHistory] = useState(false)
   const [announcementHistory, setAnnouncementHistory] = useState([])
   const [historyLoading, setHistoryLoading] = useState(false)
   const [selectedAnnounce, setSelectedAnnounce] = useState(null)
   ```

3. Replace `handleBroadcast`:
   ```jsx
   const handleBroadcast = async () => {
     if (!broadcastMsg.trim()) return
     if (!window.confirm(`Send broadcast to "${broadcastTarget}" group? This cannot be undone.`)) return
     setBroadcasting(true)
     setBroadcastResult(null)
     try {
       const data = await postAnnouncement({
         title: broadcastTitle.trim() || 'Announcement',
         message: broadcastMsg.trim(),
         target: broadcastTarget,
         also_send_telegram: alsoSendTelegram,
       })
       setBroadcastResult({ ok: true, data })
       setBroadcastMsg('')
       setBroadcastTitle('')
     } catch (err) {
       setBroadcastResult({ ok: false, msg: err.response?.data?.detail || 'Broadcast failed' })
     } finally {
       setBroadcasting(false)
     }
   }
   ```

4. Add fetch for history:
   ```jsx
   const fetchAnnouncementHistory = async () => {
     setHistoryLoading(true)
     try {
       const data = await listAnnouncements({ limit: 20 })
       setAnnouncementHistory(data.announcements || [])
     } catch (e) {
       console.error('Failed to load announcement history', e)
     } finally {
       setHistoryLoading(false)
     }
   }
   ```

5. Update the broadcast tab JSX to include a title input, broadcast result display, and collapsible history.

6. Add the announcement detail modal (similar to existing modals in Admin.jsx).

---

## Step 11 — Backend: Tests

**SUBAGENT 19 — Create `tests/test_notifications.py`**

Read existing test files in `tests/` to match conventions (e.g., `tests/test_database.py`, `tests/test_tickets.py` patterns with fixtures, async test functions, pytest markers).

Create `tests/test_notifications.py` with tests covering:

1. **Notification model creation** — test enum values, default state is unread, mark_read() works.
2. **Announcement model** — test creation, to_dict().
3. **notify_user** — test that notification is pushed to user doc, cap/prune works (push 110, verify only 100 kept with all unread preserved).
4. **mark_read** — test state transition, read_at timestamp set.
5. **delete notification** — test removal from array.
6. **clear_read** — test that only READ items removed.
7. **broadcast** — test that announcement doc created and users receive notification.
8. **API endpoints** via TestClient/httpx async tests:
   - `GET /api/v1/notifications/me` returns correct structure
   - `PUT /api/v1/notifications/me/{id}/read` marks as read
   - `PUT /api/v1/notifications/me/read-all` marks all as read
   - `DELETE /api/v1/notifications/me/{id}` deletes notification
   - `POST /api/v1/admin/announcements` creates and fans out (mock db)
   - `GET /api/v1/admin/announcements` lists history

---

## Step 12 — Frontend: Tests

**SUBAGENT 20 — Create frontend tests**

Read existing test patterns in the project. If none exist, create basic smoke tests:

- `frontend/src/__tests__/NotificationBell.test.jsx` — render test with mock context
- `frontend/src/__tests__/NotificationsContext.test.jsx` — verify provider renders children

If the project uses vitest:
```bash
npm test -- --run
```

Otherwise, create basic component tests.

---

## Step 13 — Lint & typecheck

**SUBAGENT 21 — Run lint/typecheck**

```bash
# Backend
cd /root/Raha && python -m flake8 app/models/notification.py app/models/announcement.py app/services/notifications.py app/routers/notifications.py app/utils/telegram.py 2>&1
python -m mypy app/models/notification.py app/models/announcement.py app/services/notifications.py app/routers/notifications.py app/utils/telegram.py --ignore-missing-imports 2>&1

# Frontend
cd /root/Raha/frontend && npx eslint src/components/NotificationBell.jsx src/context/NotificationsContext.jsx src/App.jsx src/pages/Admin.jsx 2>&1
```

Fix all reported issues.

---

## Step 14 — Run all tests

**SUBAGENT 22 — Run full test suite**

```bash
# Backend
cd /root/Raha && python -m pytest tests/ -v --tb=short 2>&1

# Frontend
cd /root/Raha/frontend && npm test -- --run 2>&1
```

Report any failures and fix.

---

## Step 15 — Final commit

```bash
cd /root/Raha
git add -A
git status
git diff --cached --stat
git commit -m "feat: complete notification system

- Add Notification and Announcement models
- Add notification service with broadcast, prune, fan-out
- Add notifications router with user and admin endpoints
- Wire events: deposit, plan purchase, loan, ticket, referral
- Add shared telegram utility
- Frontend: NotificationBell dropdown, detail modal
- Frontend: NotificationsContext with auto-poll
- Frontend: Admin broadcast tab with announcement history
- Tests for models, service, and API endpoints
"
```

---

## Execution order summary

```
Pre-build: git checkout -b feature/notification-system
    │
Step 0    — Read reference files for conventions
    │
Step 1    — Create models (notification.py, announcement.py)
    │         → update user.py, __init__.py, database.py
    │
Step 2    — telegram.py utility + notifications service
    │
Step 3    — Notifications router + register in main.py
    │
Step 4    — Wire events into payments.py, loans.py, tickets.py
    │
Step 5    — Refactor admin.py to use shared telegram utility
    │
Step 6    — Frontend API client additions
    │
Step 7    — NotificationsContext
    │
Step 8    — NotificationBell component
    │
Step 9    — Wire NotificationBell into App.jsx
    │
Step 10   — Update Admin broadcast tab
    │
Step 11   — Backend tests
    │
Step 12   — Frontend tests
    │
Step 13   — Lint / typecheck
    │
Step 14   — Run full test suite
    │
Step 15   — Final commit
```

**Subagent strategy:**
- Steps 1, 2, 3, 4, 5 all have no dependencies on each other (except Step 2 must be before Step 4 for the import chain). Run them in parallel phases:
  - **Phase 1** (parallel): Step 1 (all subagents), Step 2 (both), Step 6
  - **Phase 2** (parallel): Step 3, Step 5, Step 7, Step 8
  - **Phase 3** (parallel): Step 9, Step 10
  - **Phase 4** (parallel): Step 11, Step 12, Step 13
  - **Phase 5**: Step 14 (dependent on all previous), Step 15
- Each subagent is a `task subagent_type="general"` call with the full prompt from this plan.
- After each subagent completes, verify the result by reading the created/modified files before running the dependent next step.
- If any step fails, fix it immediately before moving to the next phase.
