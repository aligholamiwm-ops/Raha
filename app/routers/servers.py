import logging
from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import require_admin
from app.models.user import UserModel
from app.config import get_settings, Settings
from app.integrations.xui_api import build_xui_client

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get('/', summary='List all servers from .env (admin)')
async def list_servers(
    _admin: UserModel = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Returns servers configured in .env (sensitive fields excluded)."""
    servers = settings.get_server_list()
    return [
        {
            "name": s.get("name", s.get("server_name", "")),
            "ip": s.get("ip", s.get("ip_address", "")),
            "port": s.get("port", s.get("panel_port", 2053)),
            "inbound_id": s.get("inbound_id", 1),
            "status": s.get("status", "enabled"),
        }
        for s in servers
    ]


@router.post('/{server_name}/test', summary='Test XUI connection for a server (admin)')
async def test_server_connection(
    server_name: str,
    _admin: UserModel = Depends(require_admin),
    settings: Settings = Depends(get_settings),
) -> dict:
    servers = settings.get_server_list()
    server = next(
        (s for s in servers if s.get("name", s.get("server_name", "")) == server_name),
        None,
    )
    if not server:
        raise HTTPException(status_code=404, detail="Server not found in .env configuration")

    try:
        xui = build_xui_client(server)
        cookie = await xui.login()
        inbounds = await xui.get_inbounds()
        inbound_id = int(server.get("inbound_id", 1))
        target_inbound = next((ib for ib in inbounds if ib.get("id") == inbound_id), None)
        return {
            "status": "success",
            "server_name": server_name,
            "inbounds_count": len(inbounds),
            "target_inbound": target_inbound,
        }
    except Exception as exc:
        logger.error("test_server_connection failed for %s: %s", server_name, exc)
        raise HTTPException(status_code=502, detail=f"Failed to connect to server: {exc}")
