import uuid
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.models.user import UserModel
from app.models.vpn_config import VpnConfigModel, VpnConfigResponse, VpnConfigUpdate, ConfigStatus
from app.integrations.xui_api import AsyncXUIClient

logger = logging.getLogger(__name__)
router = APIRouter()

FREE_TRIAL_GB = 0.2  # 200 MB


class PurchaseRequest(BaseModel):
    plan_name: str
    isp_name: str
    discount_code: str | None = None


class RenewRequest(BaseModel):
    plan_name: str


def _referral_discount(total_gb: float) -> float:
    """Return extra discount percent based on referred GB purchased."""
    if total_gb >= 100:
        return 15.0
    if total_gb >= 50:
        return 10.0
    if total_gb >= 10:
        return 5.0
    return 0.0


def _build_xui_client(server_doc: dict, db) -> AsyncXUIClient:
    base_url = f"http://{server_doc['ip_address']}:{server_doc['panel_port']}"
    client = AsyncXUIClient(
        base_url=base_url,
        username=server_doc["username"],
        password=server_doc["password"],
        inbound_id=server_doc["inbound_id"],
        server_name=server_doc["server_name"],
        db=db,
    )
    if server_doc.get("cookie"):
        client.set_cookie(server_doc["cookie"])
    return client


def _substitute_clean_ip(vless_uri: str, clean_ip: str) -> str:
    """Replace the host in a VLESS URI with the given clean IP."""
    if not vless_uri.startswith("vless://"):
        return vless_uri
    try:
        # vless://uuid@host:port?params#name
        rest = vless_uri[len("vless://"):]
        at_idx = rest.rfind("@")
        user_part = rest[:at_idx]
        host_rest = rest[at_idx + 1:]

        # Find host:port boundary
        if host_rest.startswith("["):
            # IPv6
            bracket_end = host_rest.index("]")
            port_and_rest = host_rest[bracket_end + 1:]
        else:
            colon_idx = host_rest.index(":")
            port_and_rest = host_rest[colon_idx:]

        colon_idx = port_and_rest.index(":")
        port_and_rest = port_and_rest[colon_idx:]  # ":port?params#name"

        return f"vless://{user_part}@{clean_ip}{port_and_rest}"
    except Exception:
        return vless_uri


@router.get(
    "/my",
    response_model=list[VpnConfigResponse],
    summary="Get current user's VPN configs",
)
async def get_my_configs(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[VpnConfigResponse]:
    results = []
    async for doc in db.vpn_configs.find({"telegram_id": current_user.telegram_id}):
        doc.pop("_id", None)
        results.append(VpnConfigResponse(**doc))
    return results


@router.get(
    "/",
    response_model=list[VpnConfigResponse],
    summary="List all VPN configs (admin)",
)
async def list_all_configs(
    status: ConfigStatus | None = None,
    skip: int = 0,
    limit: int = 50,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> list[VpnConfigResponse]:
    query = {"status": status.value} if status else {}
    results = []
    async for doc in db.vpn_configs.find(query).skip(skip).limit(limit):
        doc.pop("_id", None)
        results.append(VpnConfigResponse(**doc))
    return results


@router.get(
    "/{config_uuid}",
    response_model=VpnConfigResponse,
    summary="Get a single VPN config",
)
async def get_config(
    config_uuid: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> VpnConfigResponse:
    doc = await db.vpn_configs.find_one({"uuid": config_uuid})
    if not doc:
        raise HTTPException(status_code=404, detail="Config not found")
    if current_user.role != "admin" and doc["telegram_id"] != current_user.telegram_id:
        raise HTTPException(status_code=403, detail="Access denied")
    doc.pop("_id", None)
    return VpnConfigResponse(**doc)


@router.post(
    "/purchase",
    response_model=VpnConfigResponse,
    status_code=201,
    summary="Purchase a new VPN config",
    description=(
        "Purchase a VPN config using wallet balance or free trial. "
        "Optionally apply a discount code. Referral discounts applied automatically."
    ),
)
async def purchase_config(
    payload: PurchaseRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> VpnConfigResponse:
    # ------------------------------------------------------------------
    # Resolve plan
    # ------------------------------------------------------------------
    plan_doc = await db.plans.find_one({"plan_name": payload.plan_name})
    if not plan_doc:
        raise HTTPException(status_code=404, detail="Plan not found")

    traffic_gb: float = plan_doc["traffic_gb"]
    price_usd: float = plan_doc["price_usd"]
    is_free_trial = False

    # ------------------------------------------------------------------
    # Free-trial check
    # ------------------------------------------------------------------
    if not current_user.has_used_free_trial and price_usd == 0:
        is_free_trial = True
        traffic_gb = FREE_TRIAL_GB
        price_usd = 0.0
    elif not current_user.has_used_free_trial and price_usd > 0:
        # They haven't used trial yet but are purchasing — that's fine
        pass

    # ------------------------------------------------------------------
    # Discount code
    # ------------------------------------------------------------------
    discount_pct = 0.0
    if payload.discount_code:
        discount_doc = await db.discounts.find_one({"code": payload.discount_code})
        if not discount_doc:
            raise HTTPException(status_code=404, detail="Discount code not found")
        if current_user.telegram_id in discount_doc.get("used_by", []):
            raise HTTPException(status_code=400, detail="Discount code already used by you")
        discount_pct = discount_doc["discount_percent"]

    # Referral discount (stacks with explicit discount code)
    referral_pct = _referral_discount(current_user.total_referred_gb_purchased)
    total_discount = min(discount_pct + referral_pct, 100.0)
    final_price = price_usd * (1 - total_discount / 100.0)

    # ------------------------------------------------------------------
    # Wallet balance check
    # ------------------------------------------------------------------
    if not is_free_trial and final_price > 0:
        if current_user.wallet_balance_usd < final_price:
            raise HTTPException(
                status_code=402,
                detail=f"Insufficient wallet balance. Required: ${final_price:.2f}",
            )

    # ------------------------------------------------------------------
    # Pick a server (round-robin: pick server with fewest active configs)
    # ------------------------------------------------------------------
    server_doc = await db.servers.find_one({})
    if not server_doc:
        raise HTTPException(status_code=503, detail="No servers available")

    # ------------------------------------------------------------------
    # Resolve clean IP for the selected ISP
    # ------------------------------------------------------------------
    clean_ip_doc = await db.clean_ips.find_one({"isp_name": payload.isp_name})
    if not clean_ip_doc:
        raise HTTPException(
            status_code=404, detail=f"No clean IP found for ISP: {payload.isp_name}"
        )

    # ------------------------------------------------------------------
    # Create client in XUI panel
    # ------------------------------------------------------------------
    xui = _build_xui_client(server_doc, db)
    client_uuid = str(uuid.uuid4())
    email = f"tg_{current_user.telegram_id}_{client_uuid[:8]}"
    total_bytes = int(traffic_gb * 1024**3)

    client_data = {
        "id": client_uuid,
        "email": email,
        "enable": True,
        "totalGB": total_bytes,
        "expiryTime": 0,
        "flow": "",
        "limitIp": 0,
        "tgId": "",
        "subId": "",
    }
    xui_result = await xui.add_client(server_doc["inbound_id"], client_data)
    if not xui_result.get("success"):
        raise HTTPException(
            status_code=502,
            detail=f"Failed to create client on XUI panel: {xui_result.get('msg')}",
        )

    # ------------------------------------------------------------------
    # Deduct wallet balance & mark free trial
    # ------------------------------------------------------------------
    update_ops: dict = {}
    if not is_free_trial and final_price > 0:
        update_ops["$inc"] = {"wallet_balance_usd": -final_price}
    if is_free_trial:
        update_ops["$set"] = {"has_used_free_trial": True}
    if update_ops:
        await db.users.update_one({"telegram_id": current_user.telegram_id}, update_ops)

    # Mark discount code as used
    if payload.discount_code:
        await db.discounts.update_one(
            {"code": payload.discount_code},
            {"$addToSet": {"used_by": current_user.telegram_id}},
        )

    # Update referrer's total_referred_gb_purchased
    if current_user.referrer_id:
        await db.users.update_one(
            {"telegram_id": current_user.referrer_id},
            {"$inc": {"total_referred_gb_purchased": traffic_gb}},
        )

    # ------------------------------------------------------------------
    # Save config to DB
    # ------------------------------------------------------------------
    now = datetime.now(timezone.utc)
    config = VpnConfigModel(
        uuid=client_uuid,
        telegram_id=current_user.telegram_id,
        server_name=server_doc["server_name"],
        email=email,
        status=ConfigStatus.active,
        total_gb=traffic_gb,
        domain_name=clean_ip_doc["ip_address"],
        created_at=now,
    )
    await db.vpn_configs.insert_one(config.to_dict())

    return VpnConfigResponse(**config.to_dict())


@router.get(
    "/{config_uuid}/vless",
    summary="Get VLESS URI with clean IP substituted",
)
async def get_vless_uri(
    config_uuid: str,
    isp_name: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    doc = await db.vpn_configs.find_one({"uuid": config_uuid})
    if not doc:
        raise HTTPException(status_code=404, detail="Config not found")
    if current_user.role != "admin" and doc["telegram_id"] != current_user.telegram_id:
        raise HTTPException(status_code=403, detail="Access denied")

    server_doc = await db.servers.find_one({"server_name": doc["server_name"]})
    if not server_doc:
        raise HTTPException(status_code=404, detail="Server not found")

    clean_ip_doc = await db.clean_ips.find_one({"isp_name": isp_name})
    if not clean_ip_doc:
        raise HTTPException(status_code=404, detail=f"No clean IP found for ISP: {isp_name}")

    # Build a basic VLESS URI
    domain = doc.get("domain_name") or server_doc["ip_address"]
    vless_uri = (
        f"vless://{config_uuid}@{domain}:443"
        f"?type=tcp&security=tls&sni={domain}#{doc['email']}"
    )
    substituted = _substitute_clean_ip(vless_uri, clean_ip_doc["ip_address"])

    return {"vless_uri": substituted, "clean_ip": clean_ip_doc["ip_address"]}


@router.post(
    "/{config_uuid}/renew",
    response_model=VpnConfigResponse,
    summary="Renew a VPN config (deduct wallet balance)",
)
async def renew_config(
    config_uuid: str,
    payload: RenewRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> VpnConfigResponse:
    doc = await db.vpn_configs.find_one({"uuid": config_uuid})
    if not doc:
        raise HTTPException(status_code=404, detail="Config not found")
    if doc["telegram_id"] != current_user.telegram_id:
        raise HTTPException(status_code=403, detail="Access denied")

    plan_doc = await db.plans.find_one({"plan_name": payload.plan_name})
    if not plan_doc:
        raise HTTPException(status_code=404, detail="Plan not found")

    price_usd = plan_doc["price_usd"]
    referral_pct = _referral_discount(current_user.total_referred_gb_purchased)
    final_price = price_usd * (1 - referral_pct / 100.0)

    if current_user.wallet_balance_usd < final_price:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient wallet balance. Required: ${final_price:.2f}",
        )

    # Reset traffic on XUI panel
    server_doc = await db.servers.find_one({"server_name": doc["server_name"]})
    if server_doc:
        xui = _build_xui_client(server_doc, db)
        await xui.reset_client_traffic(server_doc["inbound_id"], doc["email"])

    # Update DB
    traffic_gb: float = plan_doc["traffic_gb"]
    total_bytes = int(traffic_gb * 1024**3)

    await db.users.update_one(
        {"telegram_id": current_user.telegram_id},
        {"$inc": {"wallet_balance_usd": -final_price}},
    )

    result = await db.vpn_configs.find_one_and_update(
        {"uuid": config_uuid},
        {
            "$set": {
                "total_gb": traffic_gb,
                "usage_up": 0,
                "usage_down": 0,
                "status": ConfigStatus.active.value,
                "expiry_date": None,
            }
        },
        return_document=True,
    )
    result.pop("_id", None)
    return VpnConfigResponse(**result)


@router.delete(
    "/{config_uuid}",
    status_code=204,
    summary="Delete a VPN config (admin)",
)
async def delete_config(
    config_uuid: str,
    _admin: UserModel = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_database),
) -> None:
    doc = await db.vpn_configs.find_one({"uuid": config_uuid})
    if not doc:
        raise HTTPException(status_code=404, detail="Config not found")

    server_doc = await db.servers.find_one({"server_name": doc["server_name"]})
    if server_doc:
        xui = _build_xui_client(server_doc, db)
        await xui.delete_client(server_doc["inbound_id"], config_uuid)

    await db.vpn_configs.delete_one({"uuid": config_uuid})
