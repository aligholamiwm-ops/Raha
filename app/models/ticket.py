from enum import Enum
from typing import List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field
import uuid as _uuid


class TicketStatus(str, Enum):
    open = "open"
    waiting_for_user = "waiting_for_user"
    closed = "closed"


class SenderRole(str, Enum):
    user = "user"
    admin = "admin"


class TicketMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sender_role: SenderRole
    text: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TicketModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ticket_id: str = Field(default_factory=lambda: str(_uuid.uuid4()))
    telegram_id: int
    status: TicketStatus = Field(default=TicketStatus.open)
    messages: List[TicketMessage] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return self.model_dump()


class TicketCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    initial_message: str = Field(..., description="First message text")


class TicketUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Optional[TicketStatus] = None

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)


class TicketReply(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    text: str = Field(..., description="Reply message text")
