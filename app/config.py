import json
import logging
from pydantic_settings import BaseSettings
from functools import lru_cache

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # App
    APP_ENV: str = "production"
    SECRET_KEY: str = "change-me-in-production"
    # Telegram
    BOT_TOKEN: str = ""
    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "raha_vpn"
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    # Plisio
    PLISIO_SECRET_KEY: str = ""
    PLISIO_API_KEY: str = ""
    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    # Free trial
    FREE_TRIAL_GB: float = 0.2  # 200 MB
    # Frontend / Mini App
    MINI_APP_URL: str = ""       # e.g. https://yourdomain.com
    FRONTEND_ORIGIN: str = ""    # same value, or a different CDN domain
    # Servers — JSON array of server config objects, stored in .env
    # Example: [{"name":"s1","ip":"1.2.3.4","port":2053,"username":"admin","password":"secret","inbound_id":1,"status":"enabled"}]
    SERVERS: str = "[]"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }

    def get_server_list(self) -> list[dict]:
        """Parse SERVERS JSON string and return list of server config dicts."""
        try:
            servers = json.loads(self.SERVERS)
            if isinstance(servers, list):
                return servers
        except (json.JSONDecodeError, TypeError):
            logger.error("Failed to parse SERVERS env var as JSON list")
        return []

    def get_enabled_servers(self) -> list[dict]:
        """Return only servers with status='enabled'."""
        return [s for s in self.get_server_list() if s.get("status", "enabled") == "enabled"]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
