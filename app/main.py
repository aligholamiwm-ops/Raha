import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from app.config import get_settings
from app.database import connect_db, close_db
from app.routers import (
    users,
    configs,
    plans,
    payments,
    admin,
    discounts,
    clean_ips,
    tickets,
    servers,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()

app = FastAPI(
    title="Raha VPN API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def enforce_telegram_access(request: Request, call_next):
    if request.url.path in ["/health", "/docs", "/openapi.json", "/redoc"]:
        return await call_next(request)
    
    if request.url.path.startswith("/api/v1/payments/webhook"):
        return await call_next(request)

    user_agent = request.headers.get("user-agent", "").lower()
    referer = request.headers.get("referer", "").lower()
    
    # Relaxed check: Allow if 'telegram' or 'tgwebapp' is in UA, OR if it's coming from a known telegram domain
    is_telegram = any(x in user_agent for x in ["telegram", "tgwebapp", "electron"]) or \
                  any(x in referer for x in ["telegram", "tgwebapp", "v-p-n.live"])
    
    # If it's an API call, we rely on init-data validation anyway
    if request.url.path.startswith("/api/"):
        return await call_next(request)

    if False:
        logger.warning(f"Blocked non-Telegram access: UA={user_agent}, Ref={referer}")
        return Response(content="Access Restricted to Telegram", status_code=403)

    response = await call_next(request)
    return response

app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(configs.router, prefix="/api/v1/configs", tags=["Configs"])
app.include_router(plans.router, prefix="/api/v1/plans", tags=["Plans"])
app.include_router(payments.router, prefix="/api/v1/payments", tags=["Payments"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(discounts.router, prefix="/api/v1/discounts", tags=["Discounts"])
app.include_router(clean_ips.router, prefix="/api/v1/clean-ips", tags=["Clean IPs"])
app.include_router(tickets.router, prefix="/api/v1/tickets", tags=["Tickets"])
app.include_router(servers.router, prefix="/api/v1/admin/servers", tags=["Servers"])

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    return FileResponse("frontend/dist/index.html")
