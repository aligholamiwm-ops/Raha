from pydantic_settings import BaseSettings
from functools import lru_cache


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

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
