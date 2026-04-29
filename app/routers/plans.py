from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel
from app.models.plan import PlanModel, PlanCreate, PlanUpdate

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
