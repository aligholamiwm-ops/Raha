import logging
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import require_admin, get_current_user
from app.models.user import UserModel
from app.models.plan import PlanModel, PlanCreate, PlanUpdate

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get(
    "/",
    response_model=list[PlanModel],
    summary="List all plans (public)",
)
async def list_plans(
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[PlanModel]:
    results = []
    async for doc in db.plans.find({}):
        doc.pop("_id", None)
        results.append(PlanModel(**doc))
    return results


@router.post(
    "/",
    response_model=PlanModel,
    status_code=201,
    summary="Create plan (admin)",
)
async def create_plan(
    payload: PlanCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> PlanModel:
    existing = await db.plans.find_one({"plan_name": payload.plan_name})
    if existing:
        raise HTTPException(status_code=409, detail="Plan name already exists")
    plan = PlanModel(**payload.model_dump())
    await db.plans.insert_one(plan.to_dict())
    return plan


@router.put(
    "/{plan_name}",
    response_model=PlanModel,
    summary="Update plan (admin)",
)
async def update_plan(
    plan_name: str,
    payload: PlanUpdate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> PlanModel:
    update_data = payload.to_dict()
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.plans.find_one_and_update(
        {"plan_name": plan_name},
        {"$set": update_data},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Plan not found")
    result.pop("_id", None)
    return PlanModel(**result)


@router.delete(
    "/{plan_name}",
    status_code=204,
    summary="Delete plan (admin)",
)
async def delete_plan(
    plan_name: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    result = await db.plans.delete_one({"plan_name": plan_name})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Plan not found")


@router.post(
    "/{plan_name}/buy",
    summary="Buy a plan with wallet balance — adds traffic_balance_gb",
)
async def buy_plan_with_wallet(
    plan_name: str,
    discount_code: str | None = None,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    plan_doc = await db.plans.find_one({"plan_name": plan_name})
    if not plan_doc:
        raise HTTPException(status_code=404, detail="Plan not found")

    price_usd: float = plan_doc["price_usd"]
    traffic_gb: float = plan_doc["traffic_gb"]

    # Apply discount code
    discount_pct = 0.0
    if discount_code:
        discount_doc = await db.discounts.find_one({"code": discount_code})
        if not discount_doc:
            raise HTTPException(status_code=404, detail="Discount code not found")
        if current_user.telegram_id in discount_doc.get("used_by", []):
            raise HTTPException(status_code=400, detail="Discount code already used by you")
        discount_pct = discount_doc["discount_percent"]

    final_price = price_usd * (1 - discount_pct / 100.0)

    if price_usd > 0 and current_user.wallet_balance_usd < final_price:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient wallet balance. Required: ${final_price:.2f}, Available: ${current_user.wallet_balance_usd:.2f}",
        )

    # Deduct wallet and credit traffic balance
    update_ops: dict = {"$inc": {"traffic_balance_gb": traffic_gb}}
    if price_usd > 0:
        update_ops["$inc"]["wallet_balance_usd"] = -final_price  # type: ignore[index]

    await db.users.update_one({"telegram_id": current_user.telegram_id}, update_ops)

    if discount_code:
        await db.discounts.update_one(
            {"code": discount_code},
            {"$addToSet": {"used_by": current_user.telegram_id}},
        )

    # Distribute referral bonuses
    if current_user.referrer_id and price_usd > 0:
        ref_cfg_doc = await db.referral_config.find_one({"_id": "global"})
        if ref_cfg_doc:
            from app.models.referral_config import ReferralConfig
            ref_cfg_doc.pop("_id", None)
            ref_cfg = ReferralConfig(**ref_cfg_doc)
            current_referrer_id = current_user.referrer_id
            for layer in range(1, 6):
                pct = ref_cfg.get_layer(layer)
                if pct <= 0 or not current_referrer_id:
                    break
                bonus = (final_price * pct) / 100.0
                inc_fields: dict = {"referral_bonus_usd": bonus}
                if layer == 1:
                    inc_fields["total_referred_usd_purchased"] = final_price
                await db.users.update_one(
                    {"telegram_id": current_referrer_id},
                    {"$inc": inc_fields},
                )
                logger.info("Layer %d referral bonus %.2f USDT to user %d", layer, bonus, current_referrer_id)
                ref_doc = await db.users.find_one({"telegram_id": current_referrer_id})
                if not ref_doc or not ref_doc.get("referrer_id"):
                    break
                current_referrer_id = ref_doc["referrer_id"]

    logger.info("User %d bought plan %s for %.2f USDT, +%.2f GB traffic", current_user.telegram_id, plan_name, final_price, traffic_gb)
    return {
        "status": "success",
        "plan_name": plan_name,
        "traffic_gb_added": traffic_gb,
        "amount_paid": final_price,
    }
