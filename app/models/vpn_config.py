from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field


class ConfigStatus(str, Enum):
    active = "active"
    expired = "expired"
    disabled = "disabled"


class VpnConfigModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    uuid: str = Field(..., description="XUI client UUID")
    telegram_id: int
    server_name: str
    email: str = Field(..., description="Unique email label in XUI panel (format: {telegram_id}-{name})")
    name: str = Field(default="", description="User-defined config name")
    enable: bool = Field(default=True, description="Whether config is enabled in XUI")
    status: ConfigStatus = Field(default=ConfigStatus.active)
    total_gb: float = Field(..., description="Total traffic limit in GB")
    usage_up: float = Field(default=0.0, ge=0.0, description="Upload usage in bytes")
    usage_down: float = Field(default=0.0, ge=0.0, description="Download usage in bytes")
    expiry_date: Optional[datetime] = Field(default=None)
    is_online: bool = Field(default=False)
    domain_name: str = Field(default="")

    def to_dict(self) -> dict:
        return self.model_dump()


class VpnConfigCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=32, description="Config name (used in email)")
    total_gb: float = Field(..., gt=0, description="Total traffic in GB to allocate")
    duration_days: int = Field(default=0, ge=0, description="Config duration in days (0 = unlimited)")
    server_name: Optional[str] = Field(default=None, description="Preferred server name (optional)")


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
    is_online: bool
    domain_name: str
