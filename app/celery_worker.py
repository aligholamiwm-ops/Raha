from celery import Celery
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "raha",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "sync-config-statuses-every-10min": {
            "task": "app.tasks.sync_config_statuses",
            "schedule": 600.0,  # every 10 minutes
        },
        "expire-old-configs-every-hour": {
            "task": "app.tasks.expire_old_configs",
            "schedule": 3600.0,
        },
    },
)
