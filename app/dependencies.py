import hashlib
import hmac
import json
import logging
from typing import Optional
from urllib.parse import unquote, parse_qsl
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Depends
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings, Settings
from app.database import get_database
from app.models.user import UserModel, UserRole

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiter (slowapi)
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# Telegram Mini App init-data validation
# ---------------------------------------------------------------------------


def validate_telegram_init_data(init_data: str, bot_token: str) -> dict:
    """
    Validate Telegram Mini App init_data using HMAC-SHA256.

    Steps:
    1. Parse the URL-encoded init_data string.
    2. Extract the ``hash`` field; build the data-check string from the
       remaining key=value pairs sorted alphabetically.
    3. Derive a secret key:  HMAC-SHA256(key="WebAppData", msg=bot_token)
    4. Compute HMAC-SHA256(key=secret_key, msg=data_check_string)
    5. Compare hex digest with the extracted hash (constant-time).

    Returns the parsed ``user`` dict if valid, raises HTTPException(403) otherwise.
    """
    try:
        params = dict(parse_qsl(init_data, keep_blank_values=True))
    except Exception:
        raise HTTPException(status_code=403, detail="Malformed init_data")

    received_hash = params.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=403, detail="Missing hash in init_data")

    # Build the data-check string
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    # Derive secret key
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256
    ).digest()

    # Compute expected hash
    expected_hash = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(status_code=403, detail="Invalid init_data signature")

    # Parse user object
    user_json = params.get("user")
    if not user_json:
        raise HTTPException(status_code=403, detail="Missing user in init_data")

    try:
        user_data = json.loads(unquote(user_json))
    except json.JSONDecodeError:
        raise HTTPException(status_code=403, detail="Invalid user JSON in init_data")

    return user_data


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------


async def get_current_user(
    authorization: str = Header(..., description="Telegram Mini App auth header: tma <initData>"),
    x_referrer_id: Optional[str] = Header(None, description="Referrer's Telegram ID (from bot start_param)"),
    db=Depends(get_database),
    settings: Settings = Depends(get_settings),
) -> UserModel:
    """Validate Telegram init_data and return (or auto-create) the UserModel."""
    if not authorization.startswith("tma ") or len(authorization) <= 4:
        raise HTTPException(
            status_code=403,
            detail="Invalid Authorization header format, expected: tma <initData>",
        )
    init_data = authorization[4:]

    user_data = validate_telegram_init_data(init_data, settings.BOT_TOKEN)

    telegram_id: int = user_data.get("id")
    if not telegram_id:
        raise HTTPException(status_code=403, detail="Cannot determine telegram_id")

    doc = await db.users.find_one({"telegram_id": telegram_id})
    if doc is None:
        referrer_id: Optional[int] = None
        if x_referrer_id:
            try:
                candidate = int(x_referrer_id)
                if candidate != telegram_id:
                    ref_doc = await db.users.find_one({"telegram_id": candidate})
                    if ref_doc:
                        referrer_id = candidate
            except (ValueError, TypeError):
                pass

        new_user = UserModel(
            telegram_id=telegram_id,
            referrer_id=referrer_id,
            created_at=datetime.now(timezone.utc),
        )
        await db.users.insert_one(new_user.to_dict())
        return new_user

    doc.pop("_id", None)
    return UserModel(**doc)


async def require_admin(
    current_user: UserModel = Depends(get_current_user),
) -> UserModel:
    """Raise 403 if the authenticated user is not an admin."""
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
