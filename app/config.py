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
    # Servers — JSON array of server config objects, stored in .env.
    # Required: name, ip (or url), inbound_id, status (enabled|disabled).
    # Auth (either, api_token preferred): api_token  OR  username + password.
    # Optional: scheme (http|https), port, base_path (e.g. "/xui"),
    #           sub_uri, sub_port (override subscription link host/port).
    # Example: [{"name":"s1","scheme":"https","ip":"1.2.3.4","port":2053,
    #            "api_token":"abcdef...","inbound_id":1,"status":"enabled"}]
    SERVERS: str = "[]"
    # Referral layer percentages (0–100). Each layer represents a deeper referral level.
    REFERRAL_LAYER_1_PCT: float = 5.0
    REFERRAL_LAYER_2_PCT: float = 3.0
    REFERRAL_LAYER_3_PCT: float = 2.0
    REFERRAL_LAYER_4_PCT: float = 1.0
    REFERRAL_LAYER_5_PCT: float = 0.5

    def get_referral_layer_pct(self, layer: int) -> float:
        """Return referral percentage for a given layer number (1–5), 0.0 if not defined."""
        mapping = {
            1: self.REFERRAL_LAYER_1_PCT,
            2: self.REFERRAL_LAYER_2_PCT,
            3: self.REFERRAL_LAYER_3_PCT,
            4: self.REFERRAL_LAYER_4_PCT,
            5: self.REFERRAL_LAYER_5_PCT,
        }
        return mapping.get(layer, 0.0)

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
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
