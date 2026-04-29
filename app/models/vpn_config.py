from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field


class ConfigStatus(str, Enum):
    active = "active"
    expired = "expired"


class VpnConfigModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    uuid: str = Field(..., description="XUI client UUID")
    telegram_id: int
    server_name: str
    email: str = Field(..., description="Unique email label in XUI panel")
    status: ConfigStatus = Field(default=ConfigStatus.active)
    total_gb: float = Field(..., description="Total traffic limit in GB")
    usage_up: float = Field(default=0.0, ge=0.0, description="Upload usage in bytes")
    usage_down: float = Field(default=0.0, ge=0.0, description="Download usage in bytes")
    expiry_date: Optional[datetime] = Field(default=None)
    is_online: bool = Field(default=False)
    domain_name: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return self.model_dump()


class VpnConfigCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    telegram_id: int
    server_name: str
    email: str
    uuid: str
    total_gb: float
    expiry_date: Optional[datetime] = None
    domain_name: str = ""


class VpnConfigUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: Optional[ConfigStatus] = None
    total_gb: Optional[float] = None
    usage_up: Optional[float] = None
    usage_down: Optional[float] = None
    expiry_date: Optional[datetime] = None
    is_online: Optional[bool] = None
    domain_name: Optional[str] = None

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)


class VpnConfigResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    uuid: str
    telegram_id: int
    server_name: str
    email: str
    status: ConfigStatus
    total_gb: float
    usage_up: float
    usage_down: float
    expiry_date: Optional[datetime]
    is_online: bool
    domain_name: str
    created_at: datetime
