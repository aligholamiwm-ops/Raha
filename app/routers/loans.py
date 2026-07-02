import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.config import get_settings, Settings
from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.loan import LoanModel, LoanCreate, LoanStatus
from app.models.user import UserModel
from app.models.payment import PaymentModel
from app.integrations.plisio import PlisioClient
from app.models.notification import NotificationCategory
from app.services.notifications import notify_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get(
    "/my",
    response_model=list[LoanModel],
    summary="List current user's loans",
)
async def get_my_loans(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[LoanModel]:
    results = []
    async for doc in db.loans.find({"telegram_id": current_user.telegram_id}).sort("created_at", -1):
        doc.pop("_id", None)
        results.append(LoanModel(**doc))
    return results


@router.post(
    "/{loan_id}/pay",
    summary="Create a Plisio invoice to settle a loan",
)
async def pay_loan(
    loan_id: str,
    request: Request,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    loan_doc = await db.loans.find_one({"loan_id": loan_id, "telegram_id": current_user.telegram_id})
    if not loan_doc:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan_doc.get("status") == LoanStatus.settled.value:
        raise HTTPException(status_code=400, detail="Loan is already settled")

    amount_usdt: float = loan_doc["amount_usdt"]

    base_url = str(request.base_url).rstrip("/")
    callback_url = f"{base_url}/api/v1/payments/webhook"

    # Create payment record first to get the payment_id for Plisio order_number
    payment = PaymentModel.for_loan(
        telegram_id=current_user.telegram_id,
        loan_id=loan_id,
        amount_usd=amount_usdt,
        plisio_txn_id="",
        invoice_url="",
    )

    plisio = PlisioClient(
        api_key=settings.PLISIO_API_KEY,
        secret_key=settings.PLISIO_SECRET_KEY,
    )
    try:
        invoice_data = await plisio.create_invoice(
            order_name=f"Raha VPN – Loan Settlement ({loan_id[:8]})",
            order_number=payment.payment_id,
            amount_usd=amount_usdt,
            callback_url=callback_url,
        )
    except Exception as exc:
        logger.error("Plisio invoice creation failed for loan %s: %s", loan_id, exc)
        raise HTTPException(status_code=502, detail="Payment gateway error") from exc

    if invoice_data.get("status") != "success":
        raise HTTPException(
            status_code=502,
            detail=f"Plisio error: {invoice_data.get('data', {}).get('message', 'Unknown')}",
        )

    invoice = invoice_data.get("data", {})

    # Persist pending payment record (type=loan so webhook can handle settlement)
    payment = PaymentModel.for_loan(
        telegram_id=current_user.telegram_id,
        loan_id=loan_id,
        amount_usd=amount_usdt,
        plisio_txn_id=invoice.get("txn_id", ""),
        invoice_url=invoice.get("invoice_url", ""),
    )
    await db.payments.insert_one(payment.to_dict())

    # Store payment_id on loan so we can track it
    await db.loans.update_one(
        {"loan_id": loan_id},
        {"$set": {"payment_id": payment.payment_id}},
    )

    return {
        "payment_id": payment.payment_id,
        "invoice_url": invoice.get("invoice_url", ""),
        "amount_usdt": amount_usdt,
        "loan_id": loan_id,
    }


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/admin/allocate",
    response_model=LoanModel,
    summary="Allocate a USDT loan to a user (admin)",
)
async def allocate_loan(
    payload: LoanCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LoanModel:
    user_doc = await db.users.find_one({"telegram_id": payload.telegram_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    new_loan = LoanModel(
        telegram_id=payload.telegram_id,
        amount_usdt=payload.amount_usdt,
        note=payload.note,
    )
    await db.loans.insert_one(new_loan.to_dict())

    # Credit wallet balance with the loan amount
    await db.users.update_one(
        {"telegram_id": payload.telegram_id},
        {"$inc": {"wallet_balance_usd": payload.amount_usdt}},
    )
    await notify_user(
        db, payload.telegram_id,
        category=NotificationCategory.loan_allocated,
        title="Loan allocated",
        message=f"Loan of ${payload.amount_usdt:.2f} USDT has been credited to your wallet.{f' Note: {payload.note}' if payload.note else ''}",
        severity="info",
        metadata={"amount_usdt": payload.amount_usdt, "loan_id": new_loan.loan_id, "note": payload.note},
    )
    logger.info(
        "Admin allocated loan of %.2f USDT to user %d (loan_id=%s)",
        payload.amount_usdt, payload.telegram_id, new_loan.loan_id,
    )
    return new_loan


@router.get(
    "/admin/user/{telegram_id}",
    response_model=list[LoanModel],
    summary="Get all loans for a specific user (admin)",
)
async def get_user_loans(
    telegram_id: int,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[LoanModel]:
    results = []
    async for doc in db.loans.find({"telegram_id": telegram_id}).sort("created_at", -1):
        doc.pop("_id", None)
        results.append(LoanModel(**doc))
    return results


class LoanAdminUpdate(BaseModel):
    """Admin payload to update a loan's amount and/or status."""
    amount_usdt: Optional[float] = Field(default=None, gt=0)
    status: Optional[LoanStatus] = None
    note: Optional[str] = None


@router.put(
    "/admin/{loan_id}",
    response_model=LoanModel,
    summary="Edit loan amount and/or settlement status (admin)",
)
async def admin_update_loan(
    loan_id: str,
    payload: LoanAdminUpdate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> LoanModel:
    loan_doc = await db.loans.find_one({"loan_id": loan_id})
    if not loan_doc:
        raise HTTPException(status_code=404, detail="Loan not found")

    update_fields: dict = {}
    if payload.amount_usdt is not None:
        update_fields["amount_usdt"] = payload.amount_usdt
    if payload.status is not None:
        update_fields["status"] = payload.status.value
        if payload.status == LoanStatus.settled and not loan_doc.get("settled_at"):
            update_fields["settled_at"] = datetime.now(timezone.utc)
        elif payload.status == LoanStatus.unpaid:
            update_fields["settled_at"] = None
    if payload.note is not None:
        update_fields["note"] = payload.note

    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.loans.find_one_and_update(
        {"loan_id": loan_id},
        {"$set": update_fields},
        return_document=True,
    )
    result.pop("_id", None)
    return LoanModel(**result)
