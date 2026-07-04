import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.dependencies import get_current_user, require_admin
from app.config import Settings, get_settings
from app.database import get_database
from app.integrations.xui_api import build_xui_client
from app.models.user import UserModel
from app.models.vpn_config import VpnConfigResponse, VpnConfigCreate, VpnConfigUpdate
from app.services.config_service import ConfigService

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_config_service(
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> ConfigService:
    return ConfigService(db, settings)


@router.get("/my")
async def get_my_configs(
    current_user: UserModel = Depends(get_current_user),
    service: ConfigService = Depends(_get_config_service),
) -> JSONResponse:
    try:
        results, errors = await service.get_user_configs(current_user.telegram_id)
    except Exception as exc:
        logger.exception("get_my_configs: unhandled error")
        raise HTTPException(status_code=502, detail=f"Failed to load configs: {exc}")
    if not results and errors:
        raise HTTPException(status_code=502, detail="; ".join(errors))
    headers = {"X-Config-Errors": json.dumps(errors)} if errors else {}
    status_code = 207 if errors else 200
    try:
        return JSONResponse(
            content=[r.model_dump(mode='json') for r in results],
            status_code=status_code,
            headers=headers,
        )
    except Exception as exc:
        logger.exception("get_my_configs: serialization error")
        raise HTTPException(status_code=502, detail=f"Config serialization failed: {exc}")


@router.get("/admin/user/{telegram_id}")
async def get_user_configs_admin(
    telegram_id: int,
    _admin: UserModel = Depends(require_admin),
    service: ConfigService = Depends(_get_config_service),
) -> JSONResponse:
    try:
        results, errors = await service.get_user_configs_admin(telegram_id)
    except Exception as exc:
        logger.exception("get_user_configs_admin: unhandled error")
        raise HTTPException(status_code=502, detail=f"Failed to load configs: {exc}")
    if not results and errors:
        raise HTTPException(status_code=502, detail="; ".join(errors))
    headers = {"X-Config-Errors": json.dumps(errors)} if errors else {}
    status_code = 207 if errors else 200
    try:
        return JSONResponse(
            content=[r.model_dump(mode='json') for r in results],
            status_code=status_code,
            headers=headers,
        )
    except Exception as exc:
        logger.exception("get_user_configs_admin: serialization error")
        raise HTTPException(status_code=502, detail=f"Config serialization failed: {exc}")


@router.post("/create", response_model=VpnConfigResponse, status_code=201)
async def create_config(
    payload: VpnConfigCreate,
    current_user: UserModel = Depends(get_current_user),
    service: ConfigService = Depends(_get_config_service),
) -> VpnConfigResponse:
    if "-" in payload.name:
        raise HTTPException(status_code=400, detail="Config name must not contain hyphens")
    if current_user.traffic_balance_gb < payload.total_gb:
        raise HTTPException(status_code=402, detail="Insufficient traffic balance")
    try:
        result = await service.create_config(
            telegram_id=current_user.telegram_id,
            name=payload.name,
            total_gb=payload.total_gb,
            duration_days=payload.duration_days,
            inbound_ids=payload.inbound_ids,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


@router.put("/{email}/toggle", response_model=VpnConfigResponse)
async def toggle_config(
    email: str,
    current_user: UserModel = Depends(get_current_user),
    service: ConfigService = Depends(_get_config_service),
) -> VpnConfigResponse:
    try:
        result = await service.toggle_config(
            email=email,
            telegram_id=current_user.telegram_id,
            role=current_user.role,
        )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")
    except ValueError:
        raise HTTPException(status_code=404, detail="Config not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


@router.put("/{email}/edit", response_model=VpnConfigResponse)
async def edit_config(
    email: str,
    payload: VpnConfigUpdate,
    current_user: UserModel = Depends(get_current_user),
    service: ConfigService = Depends(_get_config_service),
) -> VpnConfigResponse:
    try:
        result = await service.edit_config(
            email=email,
            telegram_id=current_user.telegram_id,
            role=current_user.role,
            name=payload.name,
            total_gb=payload.total_gb,
            duration_days=payload.duration_days,
        )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")
    except ValueError as e:
        msg = str(e)
        if "Insufficient" in msg:
            raise HTTPException(status_code=402, detail=msg)
        raise HTTPException(status_code=404, detail="Config not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


@router.post("/{email}/regenerate-key", response_model=VpnConfigResponse)
async def regenerate_key(
    email: str,
    current_user: UserModel = Depends(get_current_user),
    service: ConfigService = Depends(_get_config_service),
) -> VpnConfigResponse:
    try:
        result = await service.regenerate_key(
            email=email,
            telegram_id=current_user.telegram_id,
            role=current_user.role,
        )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")
    except ValueError:
        raise HTTPException(status_code=404, detail="Config not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


@router.delete("/{email}", status_code=204)
async def delete_config(
    email: str,
    current_user: UserModel = Depends(get_current_user),
    service: ConfigService = Depends(_get_config_service),
) -> None:
    try:
        await service.delete_config(
            email=email,
            telegram_id=current_user.telegram_id,
            role=current_user.role,
        )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")
    except ValueError:
        raise HTTPException(status_code=404, detail="Config not found")
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

@router.get("/{config_uuid}/vless")
async def get_vless_uri(
    config_uuid: str,
    isp_name: str = "default",
    current_user: UserModel = Depends(get_current_user),
    service: ConfigService = Depends(_get_config_service),
) -> dict:
    try:
        return await service.get_vless_uri(
            config_uuid=config_uuid,
            isp_name=isp_name,
            telegram_id=current_user.telegram_id,
            role=current_user.role,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Config not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")


@router.post("/{config_uuid}/send-to-bot")
async def send_config_to_bot(
    config_uuid: str,
    password: str = Query(..., min_length=1),
    current_user: UserModel = Depends(get_current_user),
    service: ConfigService = Depends(_get_config_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    if not settings.BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot token not configured")
    try:
        return await service.send_config_to_bot(
            config_uuid=config_uuid,
            password=password,
            telegram_id=current_user.telegram_id,
            role=current_user.role,
            bot_token=settings.BOT_TOKEN,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Config not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied")
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/inbound-options")
async def get_inbound_options(
    current_user: UserModel = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    doc = await db.settings.find_one({"_id": "available_inbound_ids"})
    available_ids = set(doc.get("inbound_ids", []) if doc else [])

    async def _fetch(server: dict) -> list[dict]:
        server_name = server.get("name", "")
        try:
            xui = build_xui_client(server)
            options = await xui.get_inbound_options()
            return [{**o, "server_name": server_name} for o in options if o.get("id") in available_ids]
        except Exception:
            return []

    tasks = [_fetch(s) for s in settings.get_enabled_servers()]
    results = await asyncio.gather(*tasks)
    combined = []
    for r in results:
        combined.extend(r)
    return combined


@router.get("/", response_model=list[VpnConfigResponse])
async def list_all_configs(
    skip: int = 0,
    limit: int = 50,
    _admin: UserModel = Depends(require_admin),
    service: ConfigService = Depends(_get_config_service),
) -> list[VpnConfigResponse]:
    return await service.list_all_configs(skip=skip, limit=limit)
