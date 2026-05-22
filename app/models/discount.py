from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


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
