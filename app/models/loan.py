import uuid
from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field


class LoanStatus(str, Enum):
    unpaid = "unpaid"
    settled = "settled"


class LoanModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    loan_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique loan identifier")
    telegram_id: int = Field(..., description="Borrower's Telegram ID")
    amount_usdt: float = Field(..., gt=0, description="Loan amount in USDT")
    status: LoanStatus = Field(default=LoanStatus.unpaid)
    note: Optional[str] = Field(default=None, description="Admin note about the loan")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    settled_at: Optional[datetime] = Field(default=None)
    payment_id: Optional[str] = Field(default=None, description="Plisio payment_id used for settlement")

    def to_dict(self) -> dict:
        return self.model_dump()


class LoanCreate(BaseModel):
    """Admin payload to allocate a loan to a user."""
    model_config = ConfigDict(populate_by_name=True)

    telegram_id: int
    amount_usdt: float = Field(..., gt=0)
    note: Optional[str] = None
