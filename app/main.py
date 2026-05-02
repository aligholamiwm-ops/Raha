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
    logger.info("Connecting to MongoDB…")
    await connect_db()
    logger.info("Database connected and indexes ensured.")
    yield
    logger.info("Closing database connection…")
    await close_db()


app = FastAPI(
    title="Raha VPN Backend",
    description=(
        "Production-ready Telegram Mini App backend for VPN configuration management. "
        "Supports user wallet, plans, XUI panel integration, crypto payments via Plisio, "
        "support tickets, referral system, and admin dashboard."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
_settings = get_settings()
_origins = ["https://t.me", "https://web.telegram.org"]
if _settings.MINI_APP_URL:
    _origins.append(_settings.MINI_APP_URL.rstrip("/"))
if _settings.FRONTEND_ORIGIN and _settings.FRONTEND_ORIGIN not in _origins:
    _origins.append(_settings.FRONTEND_ORIGIN.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
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


@app.get("/health", tags=["Health"])
async def health_check() -> dict:
    return {"status": "ok", "service": "Raha VPN Backend"}


# Must be last: catch-all static mount for the built React frontend
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    @app.middleware("http")
    async def enforce_telegram_access(request: Request, call_next):
        """
        Enforce that both frontend and API requests come from Telegram.
        Exempt: health check, docs, webhook endpoints, and admin endpoints (protected by auth).
        """
        path = request.url.path
        
        # Allow these paths without Telegram check
        public_paths = {"/health", "/docs", "/redoc", "/openapi.json"}
        # Webhook endpoints should bypass this check (they use signature verification)
        webhook_prefixes = ("/api/v1/payments/webhook",)
        # Admin endpoints are protected by require_admin dependency
        admin_prefixes = ("/api/v1/admin/",)
        
        if path in public_paths or any(path.startswith(prefix) for prefix in webhook_prefixes + admin_prefixes):
            return await call_next(request)

        # Check for Telegram indicators
        user_agent = request.headers.get("user-agent", "").lower()
        referer = request.headers.get("referer", "")
        referer_host = urlparse(referer).hostname or ""
        query_keys = {k.lower() for k in request.query_params.keys()}
        
        # For API requests, check for init-data or authorization header with Telegram init_data
        is_api_request = path.startswith("/api/")
        authorization = request.headers.get("authorization", "")
        init_data_header = request.headers.get("init-data", "")
        
        is_telegram_request = (
            "telegram" in user_agent
            or referer_host in {"t.me", "web.telegram.org"}
            or bool(query_keys & {"tgwebappdata", "tgwebappversion", "tgwebappplatform", "startapp"})
            or (is_api_request and (authorization.startswith("tma ") or init_data_header))
        )
        
        if not is_telegram_request:
            return JSONResponse(
                status_code=403,
                content={"detail": "This service is only accessible from Telegram"},
            )

        return await call_next(request)

    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
