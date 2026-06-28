import logging
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import require_admin, get_current_user
from app.models.user import UserModel
from app.models.setting import PlanModel, PlanCreate, PlanUpdate, get_setting_items
from app.config import get_settings, Settings

logger = logging.getLogger(__name__)
router = APIRouter()

SETTINGS_ID = "plans"
DISCOUNTS_ID = "discounts"


@router.get(
    "/",
    response_model=list[PlanModel],
    summary="List all plans (public)",
)
async def list_plans(
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[PlanModel]:
    items = await get_setting_items(db, SETTINGS_ID)
    return [PlanModel(**i) for i in items]


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
    items = await get_setting_items(db, SETTINGS_ID)
    if any(i["plan_name"] == payload.plan_name for i in items):
        raise HTTPException(status_code=409, detail="Plan name already exists")
    plan = PlanModel(**payload.model_dump())
    await db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$push": {"items": plan.to_dict()}},
        upsert=True,
    )
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
    items = await get_setting_items(db, SETTINGS_ID)
    idx = next((i for i, x in enumerate(items) if x["plan_name"] == plan_name), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    items[idx].update(update_data)
    await db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"items": items}})
    plan = PlanModel(**items[idx])
    return plan


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
    result = await db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$pull": {"items": {"plan_name": plan_name}}},
    )
    if result.modified_count == 0:
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
    settings: Settings = Depends(get_settings),
) -> dict:
    plans = await get_setting_items(db, SETTINGS_ID)
    plan = next((p for p in plans if p["plan_name"] == plan_name), None)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    price_usd: float = plan["price_usd"]
    traffic_gb: float = plan["traffic_gb"]

    # Apply discount code
    discount_pct = 0.0
    if discount_code:
        discounts = await get_setting_items(db, DISCOUNTS_ID)
        discount = next((d for d in discounts if d["code"] == discount_code), None)
        if not discount:
            raise HTTPException(status_code=404, detail="Discount code not found")
        if current_user.telegram_id in discount.get("used_by", []):
            raise HTTPException(status_code=400, detail="Discount code already used by you")
        max_uses = discount.get("max_uses")
        if max_uses is not None and len(discount.get("used_by", [])) >= max_uses:
            raise HTTPException(status_code=400, detail="This discount code has reached its maximum usage limit")
        discount_pct = discount["discount_percent"]

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
        await db.settings.update_one(
            {"_id": DISCOUNTS_ID, "items.code": discount_code},
            {"$addToSet": {"items.$.used_by": current_user.telegram_id}},
        )

    # Distribute referral bonuses using settings-based layer percentages
    if current_user.referral.referrer_id and price_usd > 0:
        from app.routers.payments import _distribute_referral_bonuses
        await _distribute_referral_bonuses(db, settings, current_user.telegram_id, final_price)

    logger.info("User %d bought plan %s for %.2f USDT, +%.2f GB traffic", current_user.telegram_id, plan_name, final_price, traffic_gb)
    return {
        "status": "success",
        "plan_name": plan_name,
        "traffic_gb_added": traffic_gb,
        "amount_paid": final_price,
    }
