import json
import logging
from datetime import datetime, timezone

import redis

from app.config import get_settings

logger = logging.getLogger(__name__)

BUFFER_KEY_PREFIX = "ws:buffer:"
EVENT_KEY_PREFIX = "ws:events:"
ADMIN_BUFFER_KEY = f"{BUFFER_KEY_PREFIX}__admin__"
ADMIN_EVENT_KEY = f"{EVENT_KEY_PREFIX}__admin__"
MAX_BUFFER_SIZE = 50


def publish_event_from_task(user_id: str, event_type: str, data: dict) -> None:
    settings = get_settings()
    r = redis.Redis.from_url(settings.REDIS_URL)
    try:
        event = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        serialized = json.dumps(event, default=str)

        user_buffer_key = f"{BUFFER_KEY_PREFIX}{user_id}"
        user_event_key = f"{EVENT_KEY_PREFIX}{user_id}"

        r.lpush(user_buffer_key, serialized)
        r.ltrim(user_buffer_key, 0, MAX_BUFFER_SIZE - 1)
        r.lpush(ADMIN_BUFFER_KEY, serialized)
        r.ltrim(ADMIN_BUFFER_KEY, 0, MAX_BUFFER_SIZE - 1)

        r.publish(user_event_key, serialized)
        r.publish(ADMIN_EVENT_KEY, serialized)
    except Exception:
        logger.exception("Failed to publish event from task")
        raise
    finally:
        r.close()
