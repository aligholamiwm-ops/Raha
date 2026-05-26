import uuid as _uuid
from enum import Enum
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field


class PaymentStatus(str, Enum):
    pending = "pending"
    completed = "completed"
    expired = "expired"
    cancelled = "cancelled"
    error = "error"


class PaymentType(str, Enum):
    plan = "plan"
    loan = "loan"


class PaymentModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    payment_id: str = Field(default_factory=lambda: str(_uuid.uuid4()))
    telegram_id: int
    plan_name: Optional[str] = None
    amount_usd: float = Field(..., ge=0.0)
    traffic_gb: float = Field(default=0.0, ge=0.0)
    discount_code: Optional[str] = None
    status: PaymentStatus = Field(default=PaymentStatus.pending)
    type: PaymentType = Field(default=PaymentType.plan)
    loan_id: Optional[str] = None
    plisio_txn_id: str = Field(default="")
    invoice_url: str = Field(default="")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return self.model_dump()

    @classmethod
    def for_plan(
        cls,
        telegram_id: int,
        plan_name: str,
        amount_usd: float,
        traffic_gb: float,
        discount_code: Optional[str],
        plisio_txn_id: str,
        invoice_url: str,
    ) -> "PaymentModel":
        return cls(
            telegram_id=telegram_id,
            plan_name=plan_name,
            amount_usd=amount_usd,
            traffic_gb=traffic_gb,
            discount_code=discount_code,
            type=PaymentType.plan,
            plisio_txn_id=plisio_txn_id,
            invoice_url=invoice_url,
        )

    @classmethod
    def for_loan(
        cls,
        telegram_id: int,
        loan_id: str,
        amount_usd: float,
        plisio_txn_id: str,
        invoice_url: str,
    ) -> "PaymentModel":
        return cls(
            telegram_id=telegram_id,
            amount_usd=amount_usd,
            type=PaymentType.loan,
            loan_id=loan_id,
            plisio_txn_id=plisio_txn_id,
            invoice_url=invoice_url,
        )
