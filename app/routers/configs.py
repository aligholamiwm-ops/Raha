import logging
import uuid
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.dependencies import get_current_user, require_admin
from app.config import Settings, get_settings
from app.database import get_database
from app.models.user import UserModel
from app.models.vpn_config import VpnConfigResponse, VpnConfigCreate, VpnConfigUpdate, ConfigStatus
from app.integrations.xui_api import build_xui_client
router = APIRouter()
logger = logging.getLogger(__name__)
def _parse_telegram_id_from_email(email: str) -> Optional[int]:
    try:
        return int(email.split("-")[0])
    except (ValueError, IndexError):
        return None
def _parse_name_from_email(email: str) -> str:
    parts = email.split("-", 1)
    return parts[1] if len(parts) > 1 else email
def _client_to_response(client: dict, server_name: str, telegram_id: int) -> VpnConfigResponse:
    email = client.get("email", "")
    last_online_ms = client.get("last_online", 0)
    last_online = datetime.fromtimestamp(last_online_ms / 1000.0, tz=timezone.utc) if last_online_ms and last_online_ms > 0 else None
    expiry_ms = client.get("expiry_time_ms", 0)
    expiry_date = (
        datetime.fromtimestamp(expiry_ms / 1000.0, tz=timezone.utc) if expiry_ms and expiry_ms > 0 else None
    )
    enable = client.get("enable", True)
    total_gb = client.get("total_gb", 0.0)
    usage_up = client.get("usage_up", 0)
    usage_down = client.get("usage_down", 0)
    used_gb = (usage_up + usage_down) / (1024 ** 3)
    now = datetime.now(timezone.utc)
    if not enable:
        status = ConfigStatus.disabled
    elif (total_gb > 0 and used_gb >= total_gb) or (expiry_date and expiry_date < now):
        status = ConfigStatus.expired
    else:
        status = ConfigStatus.active
    return VpnConfigResponse(
        uuid=client.get("uuid", ""),
        telegram_id=telegram_id,
        server_name=server_name,
        email=email,
        name=_parse_name_from_email(email),
        enable=enable,
        status=status,
        total_gb=total_gb,
        usage_up=usage_up,
        usage_down=usage_down,
        expiry_date=expiry_date,
        last_online=last_online,
        is_online=False,
        domain_name=client.get("domain_name", ""),
        subscription_link=client.get("subscription_link", ""),
    )
async def _find_client_by_email(settings: Settings, email: str) -> tuple[dict, dict] | tuple[None, None]:
    for server in settings.get_enabled_servers():
        try:
            xui = build_xui_client(server)
            clients = await xui.get_client_info(email=email)
            if clients:
                return clients[0], server
        except Exception:
            continue
    return None, None
async def _find_client_by_uuid(settings: Settings, config_uuid: str) -> tuple[dict, dict] | tuple[None, None]:
    for server in settings.get_enabled_servers():
        try:
            xui = build_xui_client(server)
            clients = await xui.get_client_info()
            for c in clients:
                if c.get("uuid") == config_uuid:
                    return c, server
        except Exception:
            continue
    return None, None
@router.get("/my", response_model=list[VpnConfigResponse])
async def get_my_configs(
    current_user: UserModel = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> list[VpnConfigResponse]:
    prefix = f"{current_user.telegram_id}-"
    results = []
    for server in settings.get_enabled_servers():
        server_name = server.get("name", server.get("server_name", ""))
        try:
            xui = build_xui_client(server)
            clients = await xui.get_client_info()
            for c in clients:
                email = c.get("email", "")
                if email.startswith(prefix):
                    results.append(_client_to_response(c, server_name, current_user.telegram_id))
        except Exception as exc:
            logger.warning("get_my_configs error on server %s: %s", server_name, exc)
    return results
@router.post("/create", response_model=VpnConfigResponse, status_code=201)
async def create_config(
    payload: VpnConfigCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> VpnConfigResponse:
    if "-" in payload.name:
        raise HTTPException(status_code=400, detail="Config name must not contain hyphens")
    if current_user.traffic_balance_gb < payload.total_gb:
        raise HTTPException(status_code=402, detail="Insufficient traffic balance")
    server = settings.get_enabled_servers()[0]
    server_name = server.get("name", server.get("server_name", ""))
    email = f"{current_user.telegram_id}-{payload.name}"
    config_uuid = str(uuid.uuid4())
    # Generate a unique subId for subscription link
    import hashlib
    sub_id = hashlib.md5(f"{current_user.telegram_id}-{payload.name}-{config_uuid}".encode()).hexdigest()[:16]
    expiry_time = 0
    if payload.duration_days > 0:
        expiry_time = int((datetime.now(timezone.utc).timestamp() + payload.duration_days * 86400) * 1000)
    client_data = {
        "id": config_uuid,
        "email": email,
        "enable": True,
        "totalGB": int(payload.total_gb * 1024 ** 3),
        "expiryTime": expiry_time,
        "flow": "",
        "limitIp": 0,
        "tgId": str(current_user.telegram_id),
        "subId": sub_id,
    }
    xui = build_xui_client(server)
    result = await xui.add_client(int(server.get("inbound_id", 1)), client_data)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"Failed to create config on server: {result.get('msg')}")
    await db.users.update_one(
        {"telegram_id": current_user.telegram_id},
        {"$inc": {"traffic_balance_gb": -payload.total_gb}}
    )
    clients = await xui.get_client_info(email=email)
    return _client_to_response(clients[0] if clients else {**client_data, "uuid": config_uuid, "subscription_link": xui.build_subscription_link(sub_id)}, server_name, current_user.telegram_id)
@router.put("/{email}/toggle", response_model=VpnConfigResponse)
async def toggle_config(
    email: str,
    current_user: UserModel = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> VpnConfigResponse:
    tid = _parse_telegram_id_from_email(email)
    if tid != current_user.telegram_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    client, server = await _find_client_by_email(settings, email)
    if not client or not server:
        raise HTTPException(status_code=404, detail="Config not found")
    inbound_id = client.get("inbound_id") or int(server.get("inbound_id", 1))
    server_name = server.get("name", server.get("server_name", ""))
    client_data = {
        "id": client["uuid"],
        "email": email,
        "enable": not client.get("enable", True),
        "totalGB": int(client.get("total_gb", 0) * 1024 ** 3),
        "expiryTime": client.get("expiry_time_ms", 0),
        "flow": "",
        "limitIp": 0,
        "tgId": str(tid or ""),
        "subId": client.get("subId", ""),
    }
    xui = build_xui_client(server)
    result = await xui.update_client(inbound_id, client["uuid"], client_data)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"Failed to toggle config: {result.get('msg')}")
    clients = await xui.get_client_info(email=email)
    return _client_to_response(clients[0] if clients else {**client, "enable": not client.get("enable")}, server_name, tid or current_user.telegram_id)
@router.put("/{email}/edit", response_model=VpnConfigResponse)
async def edit_config(
    email: str,
    payload: VpnConfigUpdate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> VpnConfigResponse:
    tid = _parse_telegram_id_from_email(email)
    if tid != current_user.telegram_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    client, server = await _find_client_by_email(settings, email)
    if not client or not server:
        raise HTTPException(status_code=404, detail="Config not found")
    if payload.total_gb is not None:
        diff = payload.total_gb - client.get("total_gb", 0)
        if diff > 0 and current_user.traffic_balance_gb < diff:
            raise HTTPException(status_code=402, detail=f"Insufficient balance. Need {diff:.2f} GB more.")
        if diff != 0:
            await db.users.update_one({"telegram_id": current_user.telegram_id}, {"$inc": {"traffic_balance_gb": -diff}})
    inbound_id = client.get("inbound_id") or int(server.get("inbound_id", 1))
    server_name = server.get("name", server.get("server_name", ""))
    new_email = f"{tid}-{payload.name}" if payload.name else email
    expiry_time = client.get("expiry_time_ms", 0)
    if payload.duration_days is not None and payload.duration_days > 0:
        expiry_time = int((datetime.now(timezone.utc).timestamp() + payload.duration_days * 86400) * 1000)
    elif payload.duration_days == 0:
        expiry_time = 0  # unlimited
    client_data = {
        "id": client["uuid"],
        "email": new_email,
        "enable": client.get("enable", True),
        "totalGB": int((payload.total_gb or client.get("total_gb", 0)) * 1024 ** 3),
        "expiryTime": expiry_time,
        "flow": "",
        "limitIp": 0,
        "tgId": str(tid or ""),
        "subId": client.get("subId", ""),
    }
    xui = build_xui_client(server)
    result = await xui.update_client(inbound_id, client["uuid"], client_data)
    if not result.get("success"):
        if payload.total_gb is not None:
            diff = payload.total_gb - client.get("total_gb", 0)
            await db.users.update_one({"telegram_id": current_user.telegram_id}, {"$inc": {"traffic_balance_gb": diff}})
        raise HTTPException(status_code=502, detail=f"XUI error: {result.get('msg')}")
    clients = await xui.get_client_info(email=new_email)
    return _client_to_response(clients[0] if clients else client, server_name, tid or current_user.telegram_id)
@router.post("/{email}/regenerate-key", response_model=VpnConfigResponse)
async def regenerate_key(
    email: str,
    current_user: UserModel = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> VpnConfigResponse:
    tid = _parse_telegram_id_from_email(email)
    if tid != current_user.telegram_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    client, server = await _find_client_by_email(settings, email)
    if not client or not server:
        raise HTTPException(status_code=404, detail="Config not found")
    inbound_id = client.get("inbound_id") or int(server.get("inbound_id", 1))
    server_name = server.get("name", server.get("server_name", ""))
    new_uuid = str(uuid.uuid4())
    client_data = {
        "id": new_uuid,
        "email": email,
        "enable": client.get("enable", True),
        "totalGB": int(client.get("total_gb", 0) * 1024 ** 3),
        "expiryTime": client.get("expiry_time_ms", 0),
        "flow": "",
        "limitIp": 0,
        "tgId": str(tid or ""),
        "subId": client.get("subId", ""),
    }
    xui = build_xui_client(server)
    result = await xui.update_client(inbound_id, client["uuid"], client_data)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"Failed to regenerate key: {result.get('msg')}")
    clients = await xui.get_client_info(email=email)
    refreshed = clients[0] if clients else {**client, "uuid": new_uuid}
    return _client_to_response(refreshed, server_name, tid or current_user.telegram_id)
@router.delete("/{email}", status_code=204)
async def delete_config(
    email: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> None:
    tid = _parse_telegram_id_from_email(email)
    if tid != current_user.telegram_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    client, server = await _find_client_by_email(settings, email)
    if not client or not server:
        raise HTTPException(status_code=404, detail="Config not found")
    inbound_id = client.get("inbound_id") or int(server.get("inbound_id", 1))
    xui = build_xui_client(server)
    result = await xui.delete_client(inbound_id, client["uuid"])
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"Failed to delete config: {result.get('msg')}")
    total_gb = client.get("total_gb", 0.0)
    usage_bytes = client.get("usage_up", 0) + client.get("usage_down", 0)
    used_gb = usage_bytes / (1024 ** 3)
    refund_gb = max(0.0, total_gb - used_gb)
    if refund_gb > 0 and tid:
        await db.users.update_one({"telegram_id": tid}, {"$inc": {"traffic_balance_gb": refund_gb}})
@router.get("/{config_uuid}/vless")
async def get_vless_uri(
    config_uuid: str,
    isp_name: str = "default",
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> dict:
    client, server = await _find_client_by_uuid(settings, config_uuid)
    if not client or not server:
        raise HTTPException(status_code=404, detail="Config not found")
    tid = _parse_telegram_id_from_email(client.get("email", ""))
    if tid != current_user.telegram_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    domain = server.get("ip", server.get("ip_address", ""))
    if "://" in domain: domain = domain.split("://")[1]
    if ":" in domain: domain = domain.split(":")[0]
    port = 443
    email_label = client.get("email", "")
    name_only = _parse_name_from_email(email_label)
    clean_ip = domain
    if isp_name and isp_name != "default":
        clean_ip_doc = await db.clean_ips.find_one({"isp_name": isp_name})
        if clean_ip_doc:
            clean_ip = clean_ip_doc["ip_address"]
    vless_uri = f"vless://{config_uuid}@{clean_ip}:{port}?type=tcp&security=tls&sni={domain}#{name_only}"
    # Build subscription link from xui client
    xui = build_xui_client(server)
    sub_id = client.get("subId", "")
    subscription_link = xui.build_subscription_link(sub_id) if sub_id else ""
    return {"vless_uri": vless_uri, "clean_ip": clean_ip, "domain": domain, "subscription_link": subscription_link}
@router.get("/", response_model=list[VpnConfigResponse])
async def list_all_configs(
    skip: int = 0,
    limit: int = 50,
    _admin: UserModel = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> list[VpnConfigResponse]:
    results = []
    for server in settings.get_server_list():
        server_name = server.get("name", server.get("server_name", ""))
        try:
            xui = build_xui_client(server)
            clients = await xui.get_client_info()
            for c in clients:
                tid = _parse_telegram_id_from_email(c.get("email", ""))
                results.append(_client_to_response(c, server_name, tid or 0))
        except Exception as exc:
            logger.warning("list_all_configs error on server %s: %s", server_name, exc)
    return results[skip: skip + limit]
