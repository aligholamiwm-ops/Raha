import uuid
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel
from app.models.vpn_config import VpnConfigResponse, VpnConfigUpdate, ConfigStatus, VpnConfigCreate
from app.integrations.xui_api import build_xui_client
from app.config import get_settings, Settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_telegram_id_from_email(email: str) -> int | None:
    """Parse telegram_id from email format '{telegram_id}-{name}'."""
    try:
        return int(email.split("-")[0])
    except (ValueError, IndexError):
        return None


def _parse_name_from_email(email: str) -> str:
    """Parse config name from email format '{telegram_id}-{name}'."""
    parts = email.split("-", 1)
    return parts[1] if len(parts) > 1 else email


def _client_to_response(client: dict, server_name: str, telegram_id: int) -> VpnConfigResponse:
    """Convert XUI client dict to VpnConfigResponse."""
    email = client.get("email", "")
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
        is_online=False,
        domain_name=client.get("domain_name", ""),
    )


async def _find_client_by_email(settings: Settings, email: str) -> tuple[dict, dict] | tuple[None, None]:
    """Find a client by email across all enabled servers. Returns (client, server) or (None, None)."""
    for server in settings.get_enabled_servers():
        try:
            xui = build_xui_client(server)
            clients = await xui.get_client_info(email=email)
            if clients:
                return clients[0], server
        except Exception as exc:
            logger.warning("_find_client_by_email error on server %s: %s", server.get("name"), exc)
    return None, None


async def _find_client_by_uuid(settings: Settings, config_uuid: str) -> tuple[dict, dict] | tuple[None, None]:
    """Find a client by UUID across all servers. Returns (client, server) or (None, None)."""
    for server in settings.get_server_list():
        try:
            xui = build_xui_client(server)
            clients = await xui.get_client_info()
            for c in clients:
                if c.get("uuid") == config_uuid:
                    return c, server
        except Exception as exc:
            logger.warning("_find_client_by_uuid error on server %s: %s", server.get("name"), exc)
    return None, None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/my",
    response_model=list[VpnConfigResponse],
    summary="Get current user's VPN configs (live from XUI)",
)
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


@router.post(
    "/create",
    response_model=VpnConfigResponse,
    status_code=201,
    summary="Create a new VPN config (user-initiated, deducts from traffic_balance_gb)",
)
async def create_config(
    payload: VpnConfigCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> VpnConfigResponse:
    # Validate name (no dashes allowed to keep email format clean)
    if "-" in payload.name:
        raise HTTPException(status_code=400, detail="Config name must not contain hyphens")

    # Check traffic balance
    if current_user.traffic_balance_gb < payload.total_gb:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient traffic balance. Available: {current_user.traffic_balance_gb:.2f} GB, Required: {payload.total_gb:.2f} GB",
        )

    # Build email
    email = f"{current_user.telegram_id}-{payload.name}"

    # Check for duplicate email across servers
    existing, _ = await _find_client_by_email(settings, email)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"A config named '{payload.name}' already exists. Please choose a different name.",
        )

    # Pick server (specified or least loaded enabled server)
    servers = settings.get_enabled_servers()
    if not servers:
        raise HTTPException(status_code=503, detail="No enabled servers available")

    target_server = None
    if payload.server_name:
        target_server = next(
            (s for s in servers if s.get("name", s.get("server_name", "")) == payload.server_name),
            None,
        )
        if not target_server:
            raise HTTPException(status_code=404, detail=f"Server '{payload.server_name}' not found or not enabled")
    else:
        target_server = servers[0]  # simple selection; can be enhanced with load balancing

    server_name = target_server.get("name", target_server.get("server_name", ""))
    inbound_id = int(target_server.get("inbound_id", 1))

    # Build XUI client data
    client_uuid = str(uuid.uuid4())
    total_bytes = int(payload.total_gb * 1024 ** 3)
    expiry_ms = 0
    if payload.duration_days and payload.duration_days > 0:
        expiry_dt = datetime.now(timezone.utc) + timedelta(days=payload.duration_days)
        expiry_ms = int(expiry_dt.timestamp() * 1000)

    client_data = {
        "id": client_uuid,
        "email": email,
        "enable": True,
        "totalGB": total_bytes,
        "expiryTime": expiry_ms,
        "flow": "",
        "limitIp": 0,
        "tgId": str(current_user.telegram_id),
        "subId": "",
    }

    xui = build_xui_client(target_server)
    xui_result = await xui.add_client(inbound_id, client_data)
    if not xui_result.get("success"):
        msg = xui_result.get("msg", "")
        logger.error("create_config XUI error for user %s: %s", current_user.telegram_id, msg)
        if "duplicate" in msg.lower() or "exist" in msg.lower():
            raise HTTPException(
                status_code=409,
                detail=f"Config name '{payload.name}' already exists on the server. Please choose a different name.",
            )
        raise HTTPException(status_code=502, detail=f"Failed to create config on server: {msg}")

    # Deduct traffic balance
    await db.users.update_one(
        {"telegram_id": current_user.telegram_id},
        {"$inc": {"traffic_balance_gb": -payload.total_gb}},
    )

    expiry_date = (
        datetime.fromtimestamp(expiry_ms / 1000.0, tz=timezone.utc) if expiry_ms > 0 else None
    )

    # Get domain from server's XUI inbound
    domain_name = ""
    try:
        clients = await xui.get_client_info(email=email)
        if clients:
            domain_name = clients[0].get("domain_name", "")
    except Exception:
        pass

    return VpnConfigResponse(
        uuid=client_uuid,
        telegram_id=current_user.telegram_id,
        server_name=server_name,
        email=email,
        name=payload.name,
        enable=True,
        status=ConfigStatus.active,
        total_gb=payload.total_gb,
        usage_up=0,
        usage_down=0,
        expiry_date=expiry_date,
        is_online=False,
        domain_name=domain_name,
    )


@router.put(
    "/{email}/toggle",
    response_model=VpnConfigResponse,
    summary="Toggle a config's enable/disable status in XUI",
)
async def toggle_config(
    email: str,
    current_user: UserModel = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> VpnConfigResponse:
    # Verify ownership
    tid = _parse_telegram_id_from_email(email)
    if tid != current_user.telegram_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    client, server = await _find_client_by_email(settings, email)
    if not client or not server:
        raise HTTPException(status_code=404, detail="Config not found")

    inbound_id = client.get("inbound_id") or int(server.get("inbound_id", 1))
    new_enable = not client.get("enable", True)

    client_data = {
        "id": client["uuid"],
        "email": email,
        "enable": new_enable,
        "totalGB": int(client.get("total_gb", 0) * 1024 ** 3),
        "expiryTime": client.get("expiry_time_ms", 0),
        "flow": "",
        "limitIp": 0,
        "tgId": str(tid or ""),
        "subId": "",
    }

    xui = build_xui_client(server)
    result = await xui.update_client(inbound_id, client["uuid"], client_data)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"Failed to toggle config: {result.get('msg')}")

    # Refresh
    clients = await xui.get_client_info(email=email)
    refreshed = clients[0] if clients else {**client, "enable": new_enable}
    server_name = server.get("name", server.get("server_name", ""))
    return _client_to_response(refreshed, server_name, tid or current_user.telegram_id)


@router.put(
    "/{email}/edit",
    response_model=VpnConfigResponse,
    summary="Edit a config's name, traffic, or duration",
)
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

    inbound_id = client.get("inbound_id") or int(server.get("inbound_id", 1))
    server_name = server.get("name", server.get("server_name", ""))

    # Determine new values
    new_name = payload.name if payload.name else _parse_name_from_email(email)
    if "-" in new_name:
        raise HTTPException(status_code=400, detail="Config name must not contain hyphens")

    new_email = f"{tid}-{new_name}"
    new_total_gb = payload.total_gb if payload.total_gb is not None else client.get("total_gb", 0.0)
    new_total_bytes = int(new_total_gb * 1024 ** 3)

    # Handle traffic balance adjustment if total_gb changed
    old_total_gb = client.get("total_gb", 0.0)
    if payload.total_gb is not None and payload.total_gb != old_total_gb and tid == current_user.telegram_id:
        delta = payload.total_gb - old_total_gb
        if delta > 0 and current_user.traffic_balance_gb < delta:
            raise HTTPException(
                status_code=402,
                detail=f"Insufficient traffic balance to increase config by {delta:.2f} GB",
            )
        await db.users.update_one(
            {"telegram_id": tid},
            {"$inc": {"traffic_balance_gb": -delta}},
        )

    # Handle duration change
    if payload.duration_days is not None:
        if payload.duration_days > 0:
            expiry_dt = datetime.now(timezone.utc) + timedelta(days=payload.duration_days)
            new_expiry_ms = int(expiry_dt.timestamp() * 1000)
        else:
            new_expiry_ms = 0
    else:
        new_expiry_ms = client.get("expiry_time_ms", 0)

    client_data = {
        "id": client["uuid"],
        "email": new_email,
        "enable": client.get("enable", True),
        "totalGB": new_total_bytes,
        "expiryTime": new_expiry_ms,
        "flow": "",
        "limitIp": 0,
        "tgId": str(tid or ""),
        "subId": "",
    }

    xui = build_xui_client(server)
    result = await xui.update_client(inbound_id, client["uuid"], client_data)
    if not result.get("success"):
        logger.error("edit_config XUI error: %s", result.get("msg"))
        raise HTTPException(status_code=502, detail=f"Failed to update config: {result.get('msg')}")

    # Refresh
    clients = await xui.get_client_info(email=new_email)
    refreshed = clients[0] if clients else {**client, "email": new_email, "total_gb": new_total_gb}
    return _client_to_response(refreshed, server_name, tid or current_user.telegram_id)


@router.post(
    "/{email}/regenerate-key",
    response_model=VpnConfigResponse,
    summary="Regenerate the UUID (VLESS key) for a config",
)
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
        "subId": "",
    }

    xui = build_xui_client(server)
    result = await xui.update_client(inbound_id, client["uuid"], client_data)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=f"Failed to regenerate key: {result.get('msg')}")

    # Refresh
    clients = await xui.get_client_info(email=email)
    refreshed = clients[0] if clients else {**client, "uuid": new_uuid}
    return _client_to_response(refreshed, server_name, tid or current_user.telegram_id)


@router.delete(
    "/{email}",
    status_code=204,
    summary="Delete a VPN config and refund traffic",
)
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
        logger.error("delete_config XUI error: %s", result.get("msg"))
        raise HTTPException(status_code=502, detail=f"Failed to delete config: {result.get('msg')}")

    # Refund unused traffic
    total_gb = client.get("total_gb", 0.0)
    usage_bytes = client.get("usage_up", 0) + client.get("usage_down", 0)
    used_gb = usage_bytes / (1024 ** 3)
    refund_gb = max(0.0, total_gb - used_gb)
    if refund_gb > 0 and tid:
        await db.users.update_one(
            {"telegram_id": tid},
            {"$inc": {"traffic_balance_gb": refund_gb}},
        )


@router.get(
    "/{config_uuid}/vless",
    summary="Get VLESS URI for a config",
)
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

    domain = client.get("domain_name", "") or server.get("ip", server.get("ip_address", ""))
    port = client.get("port") or 443
    email_label = client.get("email", "")

    # Apply clean IP substitution if requested
    clean_ip = domain
    if isp_name and isp_name != "default":
        clean_ip_doc = await db.clean_ips.find_one({"isp_name": isp_name})
        if clean_ip_doc:
            clean_ip = clean_ip_doc["ip_address"]

    vless_uri = (
        f"vless://{config_uuid}@{clean_ip}:{port}"
        f"?type=tcp&security=tls&sni={domain}#{email_label}"
    )

    return {"vless_uri": vless_uri, "clean_ip": clean_ip, "domain": domain}


@router.get(
    "/",
    response_model=list[VpnConfigResponse],
    summary="List all VPN configs across all servers (admin)",
)
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
