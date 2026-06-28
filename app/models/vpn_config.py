from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field


class ConfigStatus(str, Enum):
    active = "active"
    expired = "expired"
    disabled = "disabled"


class VpnConfigCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str = Field(..., min_length=1, max_length=32, description="Config name (used in email)")
    total_gb: float = Field(..., gt=0, description="Total traffic in GB to allocate")
    duration_days: int = Field(default=0, ge=0, description="Config duration in days (0 = unlimited)")
    server_name: Optional[str] = Field(default=None, description="Preferred server name (optional)")
    inbound_ids: Optional[list[int]] = Field(default=None, description="Optional list of inbound IDs")
class VpnConfigUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: Optional[str] = Field(default=None, min_length=1, max_length=32)
    total_gb: Optional[float] = Field(default=None, gt=0)
    duration_days: Optional[int] = Field(default=None, ge=0)
    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)
class VpnConfigResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    uuid: str
    telegram_id: int
    server_name: str
    email: str
    name: str = ""
    enable: bool = True
    status: ConfigStatus
    total_gb: float
    usage_up: float
    usage_down: float
    expiry_date: Optional[datetime]
    last_online: Optional[datetime]
    is_online: bool
    domain_name: str
    subscription_link: str = Field(default="", description="XUI subscription link URL")
    inbound_ids: list[int] = Field(default_factory=list, description="Inbound IDs the client is attached to")
    inbound_names: list[str] = Field(default_factory=list, description="Human-readable inbound labels")
