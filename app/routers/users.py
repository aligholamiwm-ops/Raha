from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from typing import List, Optional

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel, UserUpdate, ReferralRecord

router = APIRouter()


class NicknameUpdate(BaseModel):
    nickname: str = Field(..., min_length=2, max_length=32, description="Display nickname")


@router.get(
    "/me",
    response_model=UserModel,
    summary="Get current user profile",
)
async def get_my_profile(
    current_user: UserModel = Depends(get_current_user),
) -> UserModel:
    return current_user


@router.get(
    "/check-nickname/{nickname}",
    summary="Check if a nickname is available (not taken by another user)",
)
async def check_nickname(
    nickname: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    if len(nickname) < 2 or len(nickname) > 32:
        return {"available": False, "reason": "Nickname must be 2–32 characters"}
    existing = await db.users.find_one(
        {"nickname": {"$regex": f"^{nickname}$", "$options": "i"},
         "telegram_id": {"$ne": current_user.telegram_id}}
    )
    if existing:
        return {"available": False, "reason": "Nickname already taken"}
    return {"available": True}


@router.put(
    "/me/nickname",
    response_model=UserModel,
    summary="Set or update own nickname",
)
async def set_nickname(
    payload: NicknameUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserModel:
    existing = await db.users.find_one(
        {"nickname": {"$regex": f"^{payload.nickname}$", "$options": "i"},
         "telegram_id": {"$ne": current_user.telegram_id}}
    )
    if existing:
        raise HTTPException(status_code=409, detail="Nickname already taken")
    await db.users.update_one(
        {"telegram_id": current_user.telegram_id},
        {"$set": {"nickname": payload.nickname}},
    )
    doc = await db.users.find_one({"telegram_id": current_user.telegram_id})
    doc.pop("_id", None)
    return UserModel(**doc)


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
    if update.wallet_balance_usd is not None:
        raise HTTPException(status_code=403, detail="Cannot set wallet balance directly")
    if update.traffic_balance_gb is not None:
        raise HTTPException(status_code=403, detail="Cannot set traffic balance directly")
    if update.role is not None:
        raise HTTPException(status_code=403, detail="Cannot change own role")

    update_data = update.to_dict()
    update_data.pop("wallet_balance_usd", None)
    update_data.pop("traffic_balance_gb", None)
    update_data.pop("role", None)

    # referral_benefit_type maps to the nested referral.benefit_type field
    benefit_type = update_data.pop("referral_benefit_type", None)

    if not update_data and benefit_type is None:
        return current_user

    set_fields: dict = {k: v for k, v in update_data.items()}
    if benefit_type is not None:
        set_fields["referral.benefit_type"] = benefit_type

    await db.users.update_one(
        {"telegram_id": current_user.telegram_id},
        {"$set": set_fields},
    )
    doc = await db.users.find_one({"telegram_id": current_user.telegram_id})
    doc.pop("_id", None)
    return UserModel(**doc)


class ReferralRecordWithUsername(ReferralRecord):
    username: Optional[str] = None


@router.get(
    "/me/referrals",
    response_model=List[ReferralRecordWithUsername],
    summary="Get current user's referral bonus records",
)
async def get_my_referrals(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> List[ReferralRecordWithUsername]:
    records = current_user.referral.records
    if not records:
        return []

    referred_ids = list({r.referred_id for r in records})
    cursor = db.users.find(
        {"telegram_id": {"$in": referred_ids}},
        {"telegram_id": 1, "telegram_info.username": 1, "nickname": 1},
    )
    username_map: dict = {}
    async for doc in cursor:
        tid = doc["telegram_id"]
        tg_info = doc.get("telegram_info") or {}
        username_map[tid] = doc.get("nickname") or tg_info.get("username") or str(tid)

    return [
        ReferralRecordWithUsername(**r.model_dump(), username=username_map.get(r.referred_id))
        for r in records
    ]


@router.post(
    "/me/charge-referral-bonuses",
    response_model=UserModel,
    summary="Apply all pending referral bonuses to the user's wallet and traffic balances",
)
async def charge_referral_bonuses(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserModel:
    """Sum all uncharged referral records and credit them to the appropriate balance.

    USDT records are added to wallet_balance_usd; traffic records are added to
    traffic_balance_gb.  Records are marked as charged=True afterwards so they
    cannot be applied again.
    """
    records = current_user.referral.records
    uncharged = [r for r in records if not r.charged]
    if not uncharged:
        return current_user

    usdt_total = sum(r.amount for r in uncharged if r.type == "usdt")
    traffic_total = sum(r.amount for r in uncharged if r.type == "traffic")

    inc_fields: dict = {}
    if usdt_total > 0:
        inc_fields["wallet_balance_usd"] = usdt_total
    if traffic_total > 0:
        inc_fields["traffic_balance_gb"] = traffic_total

    # Mark all uncharged records as charged using positional-all operator
    ops: dict = {
        "$set": {"referral.records.$[elem].charged": True},
    }
    if inc_fields:
        ops["$inc"] = inc_fields

    await db.users.update_one(
        {"telegram_id": current_user.telegram_id},
        ops,
        array_filters=[{"elem.charged": {"$ne": True}}],
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


@router.post(
    "/{telegram_id}/adjust_wallet",
    response_model=UserModel,
    summary="Adjust wallet balance by delta (admin, supports negative)",
)
async def adjust_wallet_balance(
    telegram_id: int,
    delta: float,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserModel:
    if delta == 0:
        raise HTTPException(status_code=400, detail="Delta must not be zero")
    user_doc = await db.users.find_one({"telegram_id": telegram_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    new_balance = (user_doc.get("wallet_balance_usd") or 0.0) + delta
    result = await db.users.find_one_and_update(
        {"telegram_id": telegram_id},
        {"$set": {"wallet_balance_usd": max(0.0, new_balance)}},
        return_document=True,
    )
    result.pop("_id", None)
    return UserModel(**result)


@router.post(
    "/{telegram_id}/adjust_traffic",
    response_model=UserModel,
    summary="Adjust traffic balance by delta GB (admin, supports negative)",
)
async def adjust_traffic_balance(
    telegram_id: int,
    delta: float,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserModel:
    if delta == 0:
        raise HTTPException(status_code=400, detail="Delta must not be zero")
    user_doc = await db.users.find_one({"telegram_id": telegram_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    new_balance = (user_doc.get("traffic_balance_gb") or 0.0) + delta
    result = await db.users.find_one_and_update(
        {"telegram_id": telegram_id},
        {"$set": {"traffic_balance_gb": max(0.0, new_balance)}},
        return_document=True,
    )
    result.pop("_id", None)
    return UserModel(**result)


@router.post(
    "/{telegram_id}/set_wallet",
    response_model=UserModel,
    summary="Set wallet balance to exact value (admin)",
)
async def set_wallet_balance(
    telegram_id: int,
    amount: float,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserModel:
    if amount < 0:
        raise HTTPException(status_code=400, detail="Amount must not be negative")
    user_doc = await db.users.find_one({"telegram_id": telegram_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.users.find_one_and_update(
        {"telegram_id": telegram_id},
        {"$set": {"wallet_balance_usd": amount}},
        return_document=True,
    )
    result.pop("_id", None)
    return UserModel(**result)


@router.post(
    "/{telegram_id}/set_traffic",
    response_model=UserModel,
    summary="Set traffic balance to exact value in GB (admin)",
)
async def set_traffic_balance(
    telegram_id: int,
    amount: float,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> UserModel:
    if amount < 0:
        raise HTTPException(status_code=400, detail="Amount must not be negative")
    user_doc = await db.users.find_one({"telegram_id": telegram_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    result = await db.users.find_one_and_update(
        {"telegram_id": telegram_id},
        {"$set": {"traffic_balance_gb": amount}},
        return_document=True,
    )
    result.pop("_id", None)
    return UserModel(**result)
