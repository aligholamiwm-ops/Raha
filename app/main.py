import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.database import connect_db, close_db
from app.dependencies import limiter
from app.routers import (
    users_router,
    servers_router,
    configs_router,
    clean_ips_router,
    plans_router,
    tickets_router,
    discounts_router,
    payments_router,
    admin_router,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if not settings.BOT_TOKEN:
        logger.error("CRITICAL: BOT_TOKEN is not set in environment variables!")
    if not settings.MINI_APP_URL:
        logger.warning("WARNING: MINI_APP_URL is not set.")
    await connect_db()
    yield
    await close_db()

app = FastAPI(title="Raha VPN Backend", lifespan=lifespan)

_settings = get_settings()
_origins = ["https://t.me", "https://web.telegram.org"]
if _settings.MINI_APP_URL:
    _origins.append(_settings.MINI_APP_URL.rstrip("/"))
if _settings.FRONTEND_ORIGIN and _settings.FRONTEND_ORIGIN not in _origins:
    _origins.append(_settings.FRONTEND_ORIGIN.rstrip("/"))

app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

API_PREFIX = "/api/v1"
app.include_router(users_router, prefix=f"{API_PREFIX}/users", tags=["Users"])
app.include_router(servers_router, prefix=f"{API_PREFIX}/servers", tags=["Servers"])
app.include_router(configs_router, prefix=f"{API_PREFIX}/configs", tags=["VPN Configs"])
app.include_router(clean_ips_router, prefix=f"{API_PREFIX}/clean-ips", tags=["Clean IPs"])
app.include_router(plans_router, prefix=f"{API_PREFIX}/plans", tags=["Plans"])
app.include_router(tickets_router, prefix=f"{API_PREFIX}/tickets", tags=["Tickets"])
app.include_router(discounts_router, prefix=f"{API_PREFIX}/discounts", tags=["Discounts"])
app.include_router(payments_router, prefix=f"{API_PREFIX}/payments", tags=["Payments"])
app.include_router(admin_router, prefix=f"{API_PREFIX}/admin", tags=["Admin"])

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.middleware("http")
async def enforce_telegram_access(request: Request, call_next):
    path = request.url.path
    public_paths = {"/health", "/docs", "/redoc", "/openapi.json"}
    if path in public_paths or path.startswith(("/api/v1/payments/webhook", "/api/v1/admin/")):
        return await call_next(request)
    if path.startswith("/api/"):
        auth = request.headers.get("authorization", "")
        init = request.headers.get("init-data", "")
        if not (auth.startswith("tma ") or init):
            return JSONResponse(status_code=403, content={"detail": "Only accessible from Telegram"})
    else:
        ua = request.headers.get("user-agent", "").lower()
        ref = request.headers.get("referer", "")
        ref_host = urlparse(ref).hostname or ""
        if not ("telegram" in ua or ref_host in {"t.me", "web.telegram.org"}):
            return JSONResponse(status_code=403, content={"detail": "Only accessible from Telegram"})
    return await call_next(request)

_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
