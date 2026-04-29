from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ServerModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    server_name: str = Field(..., description="Unique server identifier")
    ip_address: str = Field(..., description="Server IP address")
    panel_port: int = Field(..., description="3x-ui panel port")
    username: str = Field(..., description="Panel login username")
    password: str = Field(..., description="Panel login password")
    inbound_id: int = Field(..., description="XUI inbound ID to use")
    cookie: str = Field(default="", description="Cached session cookie")

    def to_dict(self) -> dict:
        return self.model_dump()


class ServerCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    server_name: str
    ip_address: str
    panel_port: int
    username: str
    password: str
    inbound_id: int


class ServerUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    ip_address: Optional[str] = None
    panel_port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    inbound_id: Optional[int] = None
    cookie: Optional[str] = None

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)


class ServerResponse(BaseModel):
    """Server model without sensitive fields."""
    model_config = ConfigDict(populate_by_name=True)

    server_name: str
    ip_address: str
    panel_port: int
    inbound_id: int
