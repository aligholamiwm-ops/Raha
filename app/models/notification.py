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
