import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.config import get_settings, Settings
from app.database import get_database
from app.dependencies import get_current_user
from app.models.user import UserModel
from app.integrations.plisio import PlisioClient

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateInvoiceRequest(BaseModel):
    plan_name: str
    currency: str = "BTC"


@router.post(
    "/create-invoice",
    summary="Create a Plisio crypto payment invoice",
)
async def create_invoice(
    payload: CreateInvoiceRequest,
    request: Request,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    plan_doc = await db.plans.find_one({"plan_name": payload.plan_name})
    if not plan_doc:
        raise HTTPException(status_code=404, detail="Plan not found")

    price_usd: float = plan_doc["price_usd"]
    if price_usd <= 0:
        raise HTTPException(status_code=400, detail="Plan is free; no invoice needed")

    payment_id = str(uuid.uuid4())
    order_number = payment_id

    # Build callback URL from the current request base
    base_url = str(request.base_url).rstrip("/")
    callback_url = f"{base_url}/api/v1/payments/webhook"

    plisio = PlisioClient(
        api_key=settings.PLISIO_API_KEY,
        secret_key=settings.PLISIO_SECRET_KEY,
    )
    try:
        invoice_data = await plisio.create_invoice(
            order_name=f"Raha VPN – {payload.plan_name}",
            order_number=order_number,
            amount_usd=price_usd,
            callback_url=callback_url,
        )
    except Exception as exc:
        logger.error("Plisio invoice creation failed: %s", exc)
        raise HTTPException(status_code=502, detail="Payment gateway error") from exc

    if invoice_data.get("status") != "success":
        raise HTTPException(
            status_code=502,
            detail=f"Plisio error: {invoice_data.get('data', {}).get('message', 'Unknown')}",
        )

    invoice = invoice_data.get("data", {})

    # Persist pending payment record
    payment_doc = {
        "payment_id": payment_id,
        "telegram_id": current_user.telegram_id,
        "plan_name": payload.plan_name,
        "amount_usd": price_usd,
        "status": "pending",
        "plisio_txn_id": invoice.get("txn_id", ""),
        "invoice_url": invoice.get("invoice_url", ""),
        "created_at": datetime.now(timezone.utc),
    }
    await db.payments.insert_one(payment_doc)

    return {
        "payment_id": payment_id,
        "invoice_url": invoice.get("invoice_url", ""),
        "amount_usd": price_usd,
        "plan_name": payload.plan_name,
    }


@router.post(
    "/webhook",
    summary="Plisio payment webhook (IPN callback)",
)
async def payment_webhook(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    try:
        data = await request.json()
    except Exception:
        data = dict(await request.form())

    plisio = PlisioClient(
        api_key=settings.PLISIO_API_KEY,
        secret_key=settings.PLISIO_SECRET_KEY,
    )

    if not plisio.verify_webhook(data):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    txn_id: str = data.get("txn_id", "")
    order_number: str = data.get("order_number", "")
    plisio_status: str = data.get("status", "")

    # Idempotency: only process if not already completed
    payment_doc = await db.payments.find_one({"payment_id": order_number})
    if not payment_doc:
        logger.warning("Webhook for unknown payment_id: %s", order_number)
        return {"ok": True}

    if payment_doc.get("status") == "completed":
        return {"ok": True}  # Already processed

    if plisio_status in ("completed", "mismatch"):
        telegram_id: int = payment_doc["telegram_id"]
        plan_doc = await db.plans.find_one({"plan_name": payment_doc["plan_name"]})
        amount_usd: float = payment_doc["amount_usd"]

        if plan_doc:
            # Credit the user's wallet so they can make a purchase
            await db.users.update_one(
                {"telegram_id": telegram_id},
                {"$inc": {"wallet_balance_usd": amount_usd}},
            )

        await db.payments.update_one(
            {"payment_id": order_number},
            {
                "$set": {
                    "status": "completed",
                    "plisio_txn_id": txn_id,
                    "completed_at": datetime.now(timezone.utc),
                }
            },
        )
        logger.info("Payment %s completed for user %s", order_number, telegram_id)

    elif plisio_status in ("expired", "cancelled", "error"):
        await db.payments.update_one(
            {"payment_id": order_number},
            {"$set": {"status": plisio_status}},
        )

    return {"ok": True}
