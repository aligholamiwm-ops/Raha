"""
Models for data stored in the `settings` MongoDB collection.

The settings collection uses document-per-setting-type storage:
  - {"_id": "plans",             "items": [...]}
  - {"_id": "discounts",         "items": [...]}
  - {"_id": "clean_ips",         "items": [...]}
  - {"_id": "referral_settings", "data":  {...}}

Helper:
  get_setting_items(db, setting_id) — DRY helper used by all settings routers.
"""

from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from motor.motor_asyncio import AsyncIOMotorDatabase


# ---------------------------------------------------------------------------
# Shared helper (DRY: replaces repeated _get_items pattern across routers)
# ---------------------------------------------------------------------------

async def get_setting_items(db: AsyncIOMotorDatabase, setting_id: str) -> list[dict]:
    """Fetch the 'items' list from a settings collection document."""
    doc = await db.settings.find_one({"_id": setting_id})
    return doc.get("items", []) if doc else []


# ---------------------------------------------------------------------------
# Plan schemas (stored under settings._id == "plans")
# ---------------------------------------------------------------------------

class PlanModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    plan_name: str = Field(..., description="Unique plan identifier")
    traffic_gb: float = Field(..., gt=0, description="Traffic limit in GB")
    price_usd: float = Field(..., ge=0.0, description="Price in USD")

    def to_dict(self) -> dict:
        return self.model_dump()


class PlanCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    plan_name: str
    traffic_gb: float = Field(..., gt=0)
    price_usd: float = Field(..., ge=0.0)


class PlanUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    traffic_gb: Optional[float] = Field(default=None, gt=0)
    price_usd: Optional[float] = Field(default=None, ge=0.0)

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)


# ---------------------------------------------------------------------------
# Discount schemas (stored under settings._id == "discounts")
# ---------------------------------------------------------------------------

class DiscountModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str = Field(..., description="Unique discount code")
    discount_percent: float = Field(..., ge=0.0, le=100.0, description="Discount percentage")
    used_by: List[int] = Field(default_factory=list, description="List of telegram_ids that used this code")
    max_uses: Optional[int] = Field(default=None, ge=1, description="Max number of times any user can use this code (None = unlimited)")

    def to_dict(self) -> dict:
        return self.model_dump()


class DiscountCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    code: str
    discount_percent: float = Field(..., ge=0.0, le=100.0)
    max_uses: Optional[int] = Field(default=None, ge=1, description="Max total uses (None = unlimited)")


class DiscountUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    discount_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    max_uses: Optional[int] = Field(default=None, ge=1, description="Max total uses (None = unlimited)")

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)


# ---------------------------------------------------------------------------
# Clean IP schemas (stored under settings._id == "clean_ips")
# ---------------------------------------------------------------------------

class CleanIPModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    isp_name: str = Field(..., description="ISP name (e.g. MCI, MTN)")
    ip_address: str = Field(..., description="Clean IP address for this ISP")

    def to_dict(self) -> dict:
        return self.model_dump()


class CleanIPCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    isp_name: str
    ip_address: str


# ---------------------------------------------------------------------------
# Referral settings (stored under settings._id == "referral_settings")
# ---------------------------------------------------------------------------

class ReferralSettings(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    layer_1: float = Field(default=5.0, ge=0.0, le=100.0, description="Layer 1 referral percentage")
    layer_2: float = Field(default=3.0, ge=0.0, le=100.0, description="Layer 2 referral percentage")
    layer_3: float = Field(default=2.0, ge=0.0, le=100.0, description="Layer 3 referral percentage")
    layer_4: float = Field(default=1.0, ge=0.0, le=100.0, description="Layer 4 referral percentage")
    layer_5: float = Field(default=0.5, ge=0.0, le=100.0, description="Layer 5 referral percentage")
