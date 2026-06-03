from datetime import datetime
from typing import Union
from pydantic import BaseModel, ConfigDict, Field


class ConfigHourlyBucket(BaseModel):
    u: float = Field(default=0.0, description="Upload in GB, rounded to 2 decimal places")
    d: float = Field(default=0.0, description="Download in GB, rounded to 2 decimal places")


class InboundHourlyBucket(BaseModel):
    u: int = Field(default=0, description="Upload in GB, rounded to nearest integer")
    d: int = Field(default=0, description="Download in GB, rounded to nearest integer")


class ConfigUsageDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    uuid: str
    email: str
    server_name: str
    client_status: str = Field(description="One of: active, expired, disabled, deleted")
    date: datetime = Field(description="Midnight UTC for the day this bucket covers")
    hourly_usage: list[ConfigHourlyBucket] = Field(
        default_factory=lambda: [ConfigHourlyBucket() for _ in range(24)],
        description="24-element array; index = UTC hour (0–23)",
    )


class InboundUsageDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    server_name: str
    inbound_id: Union[str, int]
    date: datetime = Field(description="Midnight UTC for the day this bucket covers")
    hourly_usage: list[InboundHourlyBucket] = Field(
        default_factory=lambda: [InboundHourlyBucket() for _ in range(24)],
        description="24-element array; index = UTC hour (0–23)",
    )
