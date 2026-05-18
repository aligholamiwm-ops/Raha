import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.config import get_settings, Settings
from app.database import get_database
from app.dependencies import get_current_user
from app.models.user import UserModel, ReferralBenefitType
from app.integrations.plisio import PlisioClient

logger = logging.getLogger(__name__)
router = APIRouter()

FIRST_REFERRAL_LAYER = 1
MAX_REFERRAL_LAYERS = 5


class CreateInvoiceRequest(BaseModel):
    plan_name: str
    currency: str = "BTC"
    discount_code: str | None = None


async def _distribute_referral_bonuses(
    db: AsyncIOMotorDatabase,
    settings: Settings,
    buyer_telegram_id: int,
    amount_usd: float,
) -> None:
    """Walk the referral chain and credit each referrer according to their benefit preference."""
    user_doc = await db.users.find_one({"telegram_id": buyer_telegram_id})
    if not user_doc or not user_doc.get("referrer_id"):
        return

    # Read referral layer percentages from DB settings (fallback to env config)
    db_settings_doc = await db.settings.find_one({"_id": "referral_settings"})
    def get_layer_pct(layer: int) -> float:
        if db_settings_doc:
            return float(db_settings_doc.get(f"layer_{layer}", 0.0))
        return settings.get_referral_layer_pct(layer)

    current_referrer_id: int | None = user_doc["referrer_id"]
    for layer in range(FIRST_REFERRAL_LAYER, MAX_REFERRAL_LAYERS + 1):
        pct = get_layer_pct(layer)
        if pct <= 0 or not current_referrer_id:
            break

        bonus = (amount_usd * pct) / 100.0

        # Read referrer to determine benefit preference
        referrer_doc = await db.users.find_one({"telegram_id": current_referrer_id})
        if not referrer_doc:
            break

        benefit_type = referrer_doc.get("referral_benefit_type", ReferralBenefitType.usdt)
        if benefit_type == ReferralBenefitType.traffic:
            # Credit traffic balance (1 USDT = 1 GB by convention) and track as GB bonus
            inc_fields: dict = {"referred_bonus_gb": bonus, "traffic_balance_gb": bonus}
        else:
            # Credit USDT wallet and track as USDT bonus
            inc_fields = {"referred_bonus_usd": bonus, "wallet_balance_usd": bonus}

        await db.users.update_one(
            {"telegram_id": current_referrer_id},
            {"$inc": inc_fields},
        )
        logger.info(
            "Layer %d referral bonus: %.4f to user %d from purchase by %d (type=%s)",
            layer, bonus, current_referrer_id, buyer_telegram_id, benefit_type,
        )

        if not referrer_doc.get("referrer_id"):
            break
        current_referrer_id = referrer_doc["referrer_id"]


@router.post(
    "/create-invoice",
    summary="Buy a plan — deducts from wallet if sufficient, otherwise creates Plisio invoice",
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

    # Apply discount code
    discount_pct = 0.0
    if payload.discount_code:
        discount_doc = await db.discounts.find_one({"code": payload.discount_code})
        if not discount_doc:
            raise HTTPException(status_code=404, detail="Discount code not found")
        if current_user.telegram_id in discount_doc.get("used_by", []):
            raise HTTPException(status_code=400, detail="Discount code already used by you")
        discount_pct = discount_doc["discount_percent"]

    final_price = price_usd * (1 - discount_pct / 100.0)

    # ── Wallet-first: pay with balance if sufficient ──────────────────────
    if current_user.wallet_balance_usd >= final_price:
        update_ops: dict = {
            "$inc": {
                "wallet_balance_usd": -final_price,
                "traffic_balance_gb": traffic_gb,
            }
        }
        await db.users.update_one({"telegram_id": current_user.telegram_id}, update_ops)

        if payload.discount_code:
            await db.discounts.update_one(
                {"code": payload.discount_code},
                {"$addToSet": {"used_by": current_user.telegram_id}},
            )

        await _distribute_referral_bonuses(db, settings, current_user.telegram_id, final_price)

        logger.info(
            "User %d bought plan %s for %.2f USDT from wallet, +%.2f GB traffic",
            current_user.telegram_id, payload.plan_name, final_price, traffic_gb,
        )
        return {
            "status": "wallet_payment",
            "plan_name": payload.plan_name,
            "traffic_gb_added": traffic_gb,
            "amount_paid": final_price,
        }

    # ── Fallback: create Plisio crypto invoice ────────────────────────────
    payment_id = str(uuid.uuid4())
    base_url = str(request.base_url).rstrip("/")
    callback_url = f"{base_url}/api/v1/payments/webhook"

    plisio = PlisioClient(
        api_key=settings.PLISIO_API_KEY,
        secret_key=settings.PLISIO_SECRET_KEY,
    )
    try:
        invoice_data = await plisio.create_invoice(
            order_name=f"Raha VPN – {payload.plan_name}",
            order_number=payment_id,
            amount_usd=final_price,
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
        "amount_usd": final_price,
        "traffic_gb": traffic_gb,
        "discount_code": payload.discount_code,
        "status": "pending",
        "plisio_txn_id": invoice.get("txn_id", ""),
        "invoice_url": invoice.get("invoice_url", ""),
        "created_at": datetime.now(timezone.utc),
    }
    await db.payments.insert_one(payment_doc)

    return {
        "status": "invoice_created",
        "payment_id": payment_id,
        "invoice_url": invoice.get("invoice_url", ""),
        "amount_usd": final_price,
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
            traffic_gb: float = payment_doc.get("traffic_gb", 0.0)

            # Apply discount code mark if present
            discount_code = payment_doc.get("discount_code")
            if discount_code:
                await db.discounts.update_one(
                    {"code": discount_code},
                    {"$addToSet": {"used_by": telegram_id}},
                )

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
                # Fallback: credit wallet
                await db.users.update_one(
                    {"telegram_id": telegram_id},
                    {"$inc": {"wallet_balance_usd": amount_usd}},
                )
                logger.info("Payment %s completed: +%.2f USDT wallet to user %s", order_number, amount_usd, telegram_id)

            await _distribute_referral_bonuses(db, settings, telegram_id, amount_usd)

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
