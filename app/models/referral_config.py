from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ReferralConfig(BaseModel):
    """Global referral layer configuration (one document stored in DB)."""
    model_config = ConfigDict(populate_by_name=True)

    layer_1: float = Field(default=0.0, ge=0.0, le=100.0, description="Layer 1 (direct referral) % of purchase amount")
    layer_2: float = Field(default=0.0, ge=0.0, le=100.0, description="Layer 2 referral %")
    layer_3: float = Field(default=0.0, ge=0.0, le=100.0, description="Layer 3 referral %")
    layer_4: float = Field(default=0.0, ge=0.0, le=100.0, description="Layer 4 referral %")
    layer_5: float = Field(default=0.0, ge=0.0, le=100.0, description="Layer 5 referral %")

    def to_dict(self) -> dict:
        return self.model_dump()

    def get_layer(self, layer: int) -> float:
        """Return percentage for a given layer number (1-5), 0 if not defined."""
        return getattr(self, f"layer_{layer}", 0.0)


class ReferralConfigUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    layer_1: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    layer_2: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    layer_3: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    layer_4: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    layer_5: Optional[float] = Field(default=None, ge=0.0, le=100.0)

    def to_dict(self) -> dict:
        return self.model_dump(exclude_none=True)
