from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import require_admin
from app.models.user import UserModel
from app.models.server import ServerModel, ServerCreate, ServerUpdate, ServerResponse

router = APIRouter()


def _to_response(doc: dict) -> ServerResponse:
    return ServerResponse(
        server_name=doc["server_name"],
        ip_address=doc["ip_address"],
        panel_port=doc["panel_port"],
        inbound_id=doc["inbound_id"],
    )


@router.get(
    "/",
    response_model=list[ServerResponse],
    summary="List all servers (admin)",
)
async def list_servers(
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[ServerResponse]:
    servers = []
    async for doc in db.servers.find({}):
        doc.pop("_id", None)
        servers.append(_to_response(doc))
    return servers


@router.post(
    "/",
    response_model=ServerResponse,
    status_code=201,
    summary="Create a new server (admin)",
)
async def create_server(
    payload: ServerCreate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ServerResponse:
    existing = await db.servers.find_one({"server_name": payload.server_name})
    if existing:
        raise HTTPException(status_code=409, detail="Server name already exists")

    server = ServerModel(**payload.model_dump())
    await db.servers.insert_one(server.to_dict())
    return _to_response(server.to_dict())


@router.get(
    "/{server_name}",
    response_model=ServerResponse,
    summary="Get server by name (admin)",
)
async def get_server(
    server_name: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ServerResponse:
    doc = await db.servers.find_one({"server_name": server_name})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    doc.pop("_id", None)
    return _to_response(doc)


@router.put(
    "/{server_name}",
    response_model=ServerResponse,
    summary="Update server (admin)",
)
async def update_server(
    server_name: str,
    payload: ServerUpdate,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> ServerResponse:
    update_data = payload.to_dict()
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = await db.servers.find_one_and_update(
        {"server_name": server_name},
        {"$set": update_data},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Server not found")
    result.pop("_id", None)
    return _to_response(result)


@router.delete(
    "/{server_name}",
    status_code=204,
    summary="Delete server (admin)",
)
async def delete_server(
    server_name: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    result = await db.servers.delete_one({"server_name": server_name})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Server not found")
