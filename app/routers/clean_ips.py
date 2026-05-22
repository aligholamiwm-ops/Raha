from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel
from app.models.clean_ip import CleanIPModel, CleanIPCreate

router = APIRouter()

SETTINGS_ID = "clean_ips"


async def _get_items(db: AsyncIOMotorDatabase) -> list[dict]:
    doc = await db.settings.find_one({"_id": SETTINGS_ID})
    return doc.get("items", []) if doc else []


@router.get("/", response_model=list[CleanIPModel], summary="List clean IPs")
async def list_clean_ips(
    isp_name: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[CleanIPModel]:
    items = await _get_items(db)
    if isp_name:
        items = [i for i in items if i["isp_name"] == isp_name]
    return [CleanIPModel(**i) for i in items]


@router.post("/", response_model=CleanIPModel, status_code=201, summary="Create clean IP (admin)")
async def create_clean_ip(
    payload: CleanIPCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> CleanIPModel:
    items = await _get_items(db)
    if any(i["isp_name"] == payload.isp_name and i["ip_address"] == payload.ip_address for i in items):
        raise HTTPException(status_code=409, detail="This IP already exists for this ISP")
    ip_model = CleanIPModel(**payload.model_dump())
    await db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$push": {"items": ip_model.to_dict()}},
        upsert=True,
    )
    return ip_model


@router.delete("/{isp_name}/{ip_address}", status_code=204, summary="Delete clean IP (admin)")
async def delete_clean_ip(
    isp_name: str,
    ip_address: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    result = await db.settings.update_one(
        {"_id": SETTINGS_ID},
        {"$pull": {"items": {"isp_name": isp_name, "ip_address": ip_address}}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Clean IP entry not found")

