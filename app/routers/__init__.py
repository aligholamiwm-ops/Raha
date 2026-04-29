from app.routers.users import router as users_router
from app.routers.servers import router as servers_router
from app.routers.configs import router as configs_router
from app.routers.clean_ips import router as clean_ips_router
from app.routers.plans import router as plans_router
from app.routers.tickets import router as tickets_router
from app.routers.discounts import router as discounts_router
from app.routers.payments import router as payments_router
from app.routers.admin import router as admin_router

__all__ = [
    "users_router",
    "servers_router",
    "configs_router",
    "clean_ips_router",
    "plans_router",
    "tickets_router",
    "discounts_router",
    "payments_router",
    "admin_router",
]
