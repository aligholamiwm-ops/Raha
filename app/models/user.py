from enum import Enum
from typing import Optional, List
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field
from app.models.notification import Notification


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


class ReferralRecord(BaseModel):
    """A single referral bonus event earned by the user."""
    model_config = ConfigDict(populate_by_name=True)

    referred_id: int = Field(..., description="Telegram ID of the referred user whose purchase triggered this bonus")
    type: ReferralBenefitType = Field(..., description="Bonus type: usdt or traffic")
    amount: float = Field(..., ge=0.0, description="Bonus amount (USD or GB)")
    layer: int = Field(default=1, ge=1, description="Referral chain layer (1 = direct referral)")
    charged: bool = Field(default=False, description="Whether this bonus has been applied to the user's balance")
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PurchaseRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    plan_name: str
    price_usd: float = Field(..., ge=0.0)
    traffic_gb: float = Field(..., ge=0.0)


class ReferralInfo(BaseModel):
    """Referral data embedded in each user document."""
    model_config = ConfigDict(populate_by_name=True)

    referrer_id: Optional[int] = Field(default=None, description="Telegram ID of the user who referred this user")
    benefit_type: ReferralBenefitType = Field(
        default=ReferralBenefitType.usdt,
        description="How this user receives referral bonuses",
    )
    records: List[ReferralRecord] = Field(default_factory=list, description="History of referral bonus events")


class UserModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    telegram_id: int = Field(..., description="Telegram user ID (primary key)")
    nickname: Optional[str] = Field(default=None, description="User-chosen display nickname")
    wallet_balance_usd: float = Field(default=0.0, ge=0.0)
    traffic_balance_gb: float = Field(default=0.0, ge=0.0, description="Traffic balance in GB")
    has_used_free_trial: bool = Field(default=False)
    role: UserRole = Field(default=UserRole.user)
    referral: ReferralInfo = Field(default_factory=ReferralInfo, description="Referral information and history")
    telegram_info: Optional[TelegramInfo] = Field(default=None, description="Telegram profile information")
    has_admin_password: bool = Field(default=False, description="Whether this admin has a 2FA dashboard password set")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notifications: List[Notification] = Field(default_factory=list,
        description="In-app notifications list (latest first, capped)")
    purchase_history: List[PurchaseRecord] = Field(default_factory=list,
        description="History of plan purchases")

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

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)
