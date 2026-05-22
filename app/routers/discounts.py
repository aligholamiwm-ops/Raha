from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel
from app.models.discount import DiscountModel, DiscountCreate, DiscountUpdate

router = APIRouter()

SETTINGS_ID = "discounts"


async def _get_items(db: AsyncIOMotorDatabase) -> list[dict]:
    doc = await db.settings.find_one({"_id": SETTINGS_ID})
    return doc.get("items", []) if doc else []


@router.get("/", response_model=list[DiscountModel], summary="List all discount codes (admin)")
async def list_discounts(
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[DiscountModel]:
    items = await _get_items(db)
    return [DiscountModel(**i) for i in items]


@router.post("/", response_model=DiscountModel, status_code=201, summary="Create discount code (admin)")
async def create_discount(
    payload: DiscountCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> DiscountModel:
    items = await _get_items(db)
    if any(i["code"] == payload.code for i in items):
        raise HTTPException(status_code=409, detail="Discount code already exists")
    discount = DiscountModel(**payload.model_dump())
    await db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$push": {"items": discount.to_dict()}},
        upsert=True,
    )
    return discount


@router.put("/{code}", response_model=DiscountModel, summary="Update discount code (admin)")
async def update_discount(
    code: str,
    payload: DiscountUpdate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> DiscountModel:
    update_data = payload.to_dict()
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    doc = await db.settings.find_one({"_id": SETTINGS_ID})
    items: list[dict] = doc.get("items", []) if doc else []
    idx = next((i for i, x in enumerate(items) if x["code"] == code), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Discount code not found")
    items[idx].update(update_data)
    await db.settings.update_one({"_id": SETTINGS_ID}, {"$set": {"items": items}})
    return DiscountModel(**items[idx])


@router.delete("/{code}", status_code=204, summary="Delete discount code (admin)")
async def delete_discount(
    code: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    result = await db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$pull": {"items": {"code": code}}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Discount code not found")


@router.get("/validate/{code}", summary="Validate a discount code (user)")
async def validate_discount(
    code: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    items = await _get_items(db)
    item = next((i for i in items if i["code"] == code), None)
    if not item:
        raise HTTPException(status_code=404, detail="Discount code not found")
    if current_user.telegram_id in item.get("used_by", []):
        raise HTTPException(status_code=400, detail="You have already used this discount code")
    return {
        "code": item["code"],
        "discount_percent": item["discount_percent"],
        "valid": True,
    }

