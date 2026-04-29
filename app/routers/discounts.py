from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel
from app.models.discount import DiscountModel, DiscountCreate, DiscountUpdate

router = APIRouter()


@router.get(
    "/",
    response_model=list[DiscountModel],
    summary="List all discount codes (admin)",
)
async def list_discounts(
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[DiscountModel]:
    results = []
    async for doc in db.discounts.find({}):
        doc.pop("_id", None)
        results.append(DiscountModel(**doc))
    return results


@router.post(
    "/",
    response_model=DiscountModel,
    status_code=201,
    summary="Create discount code (admin)",
)
async def create_discount(
    payload: DiscountCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> DiscountModel:
    existing = await db.discounts.find_one({"code": payload.code})
    if existing:
        raise HTTPException(status_code=409, detail="Discount code already exists")
    discount = DiscountModel(**payload.model_dump())
    await db.discounts.insert_one(discount.to_dict())
    return discount


@router.delete(
    "/{code}",
    status_code=204,
    summary="Delete discount code (admin)",
)
async def delete_discount(
    code: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    result = await db.discounts.delete_one({"code": code})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Discount code not found")


@router.get(
    "/validate/{code}",
    summary="Validate a discount code (user)",
    description="Returns discount details if the code is valid and not yet used by the current user.",
)
async def validate_discount(
    code: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    doc = await db.discounts.find_one({"code": code})
    if not doc:
        raise HTTPException(status_code=404, detail="Discount code not found")
    if current_user.telegram_id in doc.get("used_by", []):
        raise HTTPException(status_code=400, detail="You have already used this discount code")
    return {
        "code": doc["code"],
        "discount_percent": doc["discount_percent"],
        "valid": True,
    }
