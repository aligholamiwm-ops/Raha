from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field


class UserRole(str, Enum):
    user = "user"
    admin = "admin"


class UserModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    telegram_id: int = Field(..., description="Telegram user ID (primary key)")
    wallet_balance_usd: float = Field(default=0.0, ge=0.0)
    has_used_free_trial: bool = Field(default=False)
    referrer_id: Optional[int] = Field(default=None)
    role: UserRole = Field(default=UserRole.user)
    total_referred_gb_purchased: float = Field(default=0.0, ge=0.0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return self.model_dump()


class UserCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    telegram_id: int
    referrer_id: Optional[int] = None


class UserUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    wallet_balance_usd: Optional[float] = Field(default=None, ge=0.0)
    has_used_free_trial: Optional[bool] = None
    role: Optional[UserRole] = None
    total_referred_gb_purchased: Optional[float] = Field(default=None, ge=0.0)

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)
