from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel
from app.models.clean_ip import CleanIPModel, CleanIPCreate

router = APIRouter()


@router.get(
    "/",
    response_model=list[CleanIPModel],
    summary="List clean IPs (with optional ISP filter)",
)
async def list_clean_ips(
    isp_name: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[CleanIPModel]:
    query = {"isp_name": isp_name} if isp_name else {}
    results = []
    async for doc in db.clean_ips.find(query):
        doc.pop("_id", None)
        results.append(CleanIPModel(**doc))
    return results


@router.post(
    "/",
    response_model=CleanIPModel,
    status_code=201,
    summary="Create clean IP (admin)",
)
async def create_clean_ip(
    payload: CleanIPCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CleanIPModel:
    ip_model = CleanIPModel(**payload.model_dump())
    await db.clean_ips.insert_one(ip_model.to_dict())
    return ip_model


@router.put(
    "/{isp_name}",
    response_model=CleanIPModel,
    summary="Update clean IP by ISP name (admin)",
)
async def update_clean_ip(
    isp_name: str,
    payload: CleanIPCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CleanIPModel:
    result = await db.clean_ips.find_one_and_update(
        {"isp_name": isp_name},
        {"$set": payload.model_dump()},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Clean IP entry not found")
    result.pop("_id", None)
    return CleanIPModel(**result)


@router.delete(
    "/{isp_name}",
    status_code=204,
    summary="Delete clean IP by ISP name (admin)",
)
async def delete_clean_ip(
    isp_name: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    result = await db.clean_ips.delete_one({"isp_name": isp_name})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Clean IP entry not found")
