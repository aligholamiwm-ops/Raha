from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel, UserUpdate

router = APIRouter()


@router.get(
    "/me",
    response_model=UserModel,
    summary="Get current user profile",
)
async def get_my_profile(
    current_user: UserModel = Depends(get_current_user),
) -> UserModel:
    return current_user


@router.put(
    "/me",
    response_model=UserModel,
    summary="Update own profile (limited fields)",
)
async def update_my_profile(
    update: UserUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserModel:
    # Users can only update non-privileged fields
    allowed = {}
    if update.wallet_balance_usd is not None:
        raise HTTPException(status_code=403, detail="Cannot set wallet balance directly")
    if update.role is not None:
        raise HTTPException(status_code=403, detail="Cannot change own role")

    update_data = update.to_dict()
    update_data.pop("wallet_balance_usd", None)
    update_data.pop("role", None)

    if not update_data:
        return current_user

    await db.users.update_one(
        {"telegram_id": current_user.telegram_id},
        {"$set": update_data},
    )
    doc = await db.users.find_one({"telegram_id": current_user.telegram_id})
    doc.pop("_id", None)
    return UserModel(**doc)


@router.get(
    "/",
    response_model=list[UserModel],
    summary="List all users (admin)",
)
async def list_users(
    skip: int = 0,
    limit: int = 50,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[UserModel]:
    cursor = db.users.find({}).skip(skip).limit(limit)
    users = []
    async for doc in cursor:
        doc.pop("_id", None)
        users.append(UserModel(**doc))
    return users


@router.get(
    "/{telegram_id}",
    response_model=UserModel,
    summary="Get user by Telegram ID (admin)",
)
async def get_user(
    telegram_id: int,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserModel:
    doc = await db.users.find_one({"telegram_id": telegram_id})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    doc.pop("_id", None)
    return UserModel(**doc)


@router.post(
    "/{telegram_id}/add_balance",
    response_model=UserModel,
    summary="Add wallet balance (admin)",
)
async def add_balance(
    telegram_id: int,
    amount: float,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserModel:
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    result = await db.users.find_one_and_update(
        {"telegram_id": telegram_id},
        {"$inc": {"wallet_balance_usd": amount}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="User not found")
    result.pop("_id", None)
    return UserModel(**result)
