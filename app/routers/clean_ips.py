from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel
from app.models.clean_ip import CleanIPModel, CleanIPCreate

router = APIRouter()

@router.get("/", response_model=list[CleanIPModel], summary="List clean IPs")
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

@router.post("/", response_model=CleanIPModel, status_code=201, summary="Create clean IP (admin)")
async def create_clean_ip(
    payload: CleanIPCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CleanIPModel:
    existing = await db.clean_ips.find_one({"isp_name": payload.isp_name, "ip_address": payload.ip_address})
    if existing:
        raise HTTPException(status_code=409, detail="This IP already exists for this ISP")
    ip_model = CleanIPModel(**payload.model_dump())
    await db.clean_ips.insert_one(ip_model.to_dict())
    return ip_model

@router.delete("/{isp_name}/{ip_address}", status_code=204, summary="Delete clean IP (admin)")
async def delete_clean_ip(
    isp_name: str,
    ip_address: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    result = await db.clean_ips.delete_one({"isp_name": isp_name, "ip_address": ip_address})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Clean IP entry not found")
