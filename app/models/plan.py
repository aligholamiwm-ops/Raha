from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


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
