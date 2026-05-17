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

FIRST_REFERRAL_LAYER = 1
MAX_REFERRAL_LAYERS = 5


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
    traffic_gb: float = plan_doc["traffic_gb"]

    if price_usd <= 0:
        raise HTTPException(status_code=400, detail="Plan is free; no invoice needed")

    payment_id = str(uuid.uuid4())
    order_number = payment_id

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

    payment_doc = {
        "payment_id": payment_id,
        "telegram_id": current_user.telegram_id,
        "plan_name": payload.plan_name,
        "amount_usd": price_usd,
        "traffic_gb": traffic_gb,
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

    payment_doc = await db.payments.find_one({"payment_id": order_number})
    if not payment_doc:
        logger.warning("Webhook for unknown payment_id: %s", order_number)
        return {"ok": True}

    if payment_doc.get("status") == "completed":
        return {"ok": True}

    if plisio_status in ("completed", "mismatch"):
        telegram_id: int = payment_doc["telegram_id"]
        amount_usd: float = payment_doc["amount_usd"]
        payment_type: str = payment_doc.get("type", "plan")

        if payment_type == "loan":
            loan_id = payment_doc.get("loan_id")
            if loan_id:
                await db.loans.update_one(
                    {"loan_id": loan_id, "status": "unpaid"},
                    {
                        "$set": {
                            "status": "settled",
                            "settled_at": datetime.now(timezone.utc),
                            "payment_id": order_number,
                        }
                    },
                )
                logger.info("Loan %s settled via payment %s for user %s", loan_id, order_number, telegram_id)
        else:
            # Plan payment — credit traffic_balance_gb
            traffic_gb: float = payment_doc.get("traffic_gb", 0.0)
            if traffic_gb > 0:
                await db.users.update_one(
                    {"telegram_id": telegram_id},
                    {"$inc": {"traffic_balance_gb": traffic_gb}},
                )
                logger.info(
                    "Payment %s completed: +%.2f GB traffic to user %s",
                    order_number, traffic_gb, telegram_id,
                )
            else:
                # Fallback: custom deposit — credit wallet
                await db.users.update_one(
                    {"telegram_id": telegram_id},
                    {"$inc": {"wallet_balance_usd": amount_usd}},
                )
                logger.info("Payment %s completed: +%.2f USDT wallet to user %s", order_number, amount_usd, telegram_id)

            # Distribute referral bonuses from global config
            user_doc = await db.users.find_one({"telegram_id": telegram_id})
            if user_doc and user_doc.get("referrer_id"):
                ref_cfg_doc = await db.referral_config.find_one({"_id": "global"})
                if ref_cfg_doc:
                    from app.models.referral_config import ReferralConfig
                    ref_cfg_doc.pop("_id", None)
                    ref_cfg = ReferralConfig(**ref_cfg_doc)
                    current_referrer_id = user_doc.get("referrer_id")
                    for layer in range(FIRST_REFERRAL_LAYER, MAX_REFERRAL_LAYERS + 1):
                        pct = ref_cfg.get_layer(layer)
                        if pct <= 0 or not current_referrer_id:
                            break
                        bonus = (amount_usd * pct) / 100.0
                        inc_fields: dict = {"referral_bonus_usd": bonus}
                        if layer == FIRST_REFERRAL_LAYER:
                            inc_fields["total_referred_usd_purchased"] = amount_usd
                        await db.users.update_one(
                            {"telegram_id": current_referrer_id},
                            {"$inc": inc_fields},
                        )
                        logger.info(
                            "Layer %d referral bonus: %.2f USDT to user %d from purchase by %d",
                            layer, bonus, current_referrer_id, telegram_id,
                        )
                        ref_doc = await db.users.find_one({"telegram_id": current_referrer_id})
                        if not ref_doc or not ref_doc.get("referrer_id"):
                            break
                        current_referrer_id = ref_doc["referrer_id"]

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

    elif plisio_status in ("expired", "cancelled", "error"):
        await db.payments.update_one(
            {"payment_id": order_number},
            {"$set": {"status": plisio_status}},
        )

    return {"ok": True}

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
        amount_usd: float = payment_doc["amount_usd"]
        payment_type: str = payment_doc.get("type", "plan")

        if payment_type == "loan":
            # Settle the loan instead of crediting the wallet
            loan_id = payment_doc.get("loan_id")
            if loan_id:
                await db.loans.update_one(
                    {"loan_id": loan_id, "status": "unpaid"},
                    {
                        "$set": {
                            "status": "settled",
                            "settled_at": datetime.now(timezone.utc),
                            "payment_id": order_number,
                        }
                    },
                )
                logger.info("Loan %s settled via payment %s for user %s", loan_id, order_number, telegram_id)
        else:
            plan_doc = await db.plans.find_one({"plan_name": payment_doc["plan_name"]})

            if plan_doc:
                # Credit the user's wallet so they can make a purchase
                await db.users.update_one(
                    {"telegram_id": telegram_id},
                    {"$inc": {"wallet_balance_usd": amount_usd}},
                )
                
                # Process multi-layer referral bonuses
                user_doc = await db.users.find_one({"telegram_id": telegram_id})
                if user_doc and user_doc.get("referrer_id"):
                    referral_percentages = plan_doc.get("referral_percentages", {})
                    if referral_percentages:
                        # Calculate and distribute referral bonuses across layers
                        current_referrer_id = user_doc.get("referrer_id")
                        layer = FIRST_REFERRAL_LAYER
                        
                        while current_referrer_id and layer <= MAX_REFERRAL_LAYERS:
                            percentage = referral_percentages.get(layer, 0.0)
                            if percentage <= 0:
                                break  # No percentage defined for this layer
                            
                            bonus_amount = (amount_usd * percentage) / 100.0
                            
                            # Credit referral bonus - only increment total_referred_usd_purchased for layer 1
                            update_fields = {"referral_bonus_usd": bonus_amount}
                            if layer == FIRST_REFERRAL_LAYER:
                                update_fields["total_referred_usd_purchased"] = amount_usd
                            
                            await db.users.update_one(
                                {"telegram_id": current_referrer_id},
                                {"$inc": update_fields},
                            )
                            logger.info(
                                "Layer %d referral bonus: %.2f USDT to user %d from purchase by %d",
                                layer, bonus_amount, current_referrer_id, telegram_id
                            )
                            
                            # Move to next layer
                            referrer_doc = await db.users.find_one({"telegram_id": current_referrer_id})
                            if not referrer_doc or not referrer_doc.get("referrer_id"):
                                break
                            current_referrer_id = referrer_doc.get("referrer_id")
                            layer += 1

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
