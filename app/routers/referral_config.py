import logging
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel
from app.models.referral_config import ReferralConfig, ReferralConfigUpdate

logger = logging.getLogger(__name__)
router = APIRouter()

_CONFIG_ID = "global"


async def _get_or_create(db: AsyncIOMotorDatabase) -> ReferralConfig:
    doc = await db.referral_config.find_one({"_id": _CONFIG_ID})
    if not doc:
        default = ReferralConfig()
        await db.referral_config.insert_one({"_id": _CONFIG_ID, **default.to_dict()})
        return default
    doc.pop("_id", None)
    return ReferralConfig(**doc)


@router.get("/", response_model=ReferralConfig, summary="Get global referral layer config")
async def get_referral_config(
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ReferralConfig:
    return await _get_or_create(db)


@router.put("/", response_model=ReferralConfig, summary="Update global referral layer config (admin)")
async def update_referral_config(
    payload: ReferralConfigUpdate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ReferralConfig:
    update_data = payload.to_dict()
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        result = await db.referral_config.find_one_and_update(
            {"_id": _CONFIG_ID},
            {"$set": update_data},
            upsert=True,
            return_document=True,
        )
        if not result:
            raise HTTPException(status_code=500, detail="Failed to update referral config")
        result.pop("_id", None)
        return ReferralConfig(**result)
    except Exception as exc:
        logger.error("update_referral_config error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update referral config")
