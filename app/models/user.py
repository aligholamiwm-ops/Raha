from enum import Enum
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field


class UserRole(str, Enum):
    user = "user"
    admin = "admin"
    support = "support"


class ReferralBenefitType(str, Enum):
    usdt = "usdt"      # referral bonus credited as USDT wallet balance
    traffic = "traffic"  # referral bonus credited as traffic_balance_gb


class TelegramInfo(BaseModel):
    """Telegram user info captured from Mini App init_data or bot interactions."""
    model_config = ConfigDict(populate_by_name=True)

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    language_code: Optional[str] = None
    is_premium: bool = False
    photo_url: Optional[str] = None
    phone_number: Optional[str] = None


class UserModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    telegram_id: int = Field(..., description="Telegram user ID (primary key)")
    nickname: Optional[str] = Field(default=None, description="User-chosen display nickname")
    wallet_balance_usd: float = Field(default=0.0, ge=0.0)
    traffic_balance_gb: float = Field(default=0.0, ge=0.0, description="Traffic balance in GB")
    has_used_free_trial: bool = Field(default=False)
    referrer_id: Optional[int] = Field(default=None)
    role: UserRole = Field(default=UserRole.user)
    referred_bonus_usd: float = Field(default=0.0, ge=0.0, description="Accumulated referral bonus credited as USDT")
    referred_bonus_gb: float = Field(default=0.0, ge=0.0, description="Accumulated referral bonus credited as GB traffic")
    referral_benefit_type: ReferralBenefitType = Field(
        default=ReferralBenefitType.usdt,
        description="How the user receives referral bonuses: 'usdt' credits wallet, 'traffic' credits traffic balance",
    )
    telegram_info: Optional[TelegramInfo] = Field(default=None, description="Telegram profile information")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return self.model_dump()


class UserCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    telegram_id: int
    referrer_id: Optional[int] = None


class UserUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    nickname: Optional[str] = Field(default=None, min_length=2, max_length=32, description="User nickname")
    wallet_balance_usd: Optional[float] = Field(default=None, ge=0.0)
    traffic_balance_gb: Optional[float] = Field(default=None, ge=0.0)
    has_used_free_trial: Optional[bool] = None
    role: Optional[UserRole] = None
    referral_benefit_type: Optional[ReferralBenefitType] = None
    referred_bonus_usd: Optional[float] = Field(default=None, ge=0.0)
    referred_bonus_gb: Optional[float] = Field(default=None, ge=0.0)

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)
