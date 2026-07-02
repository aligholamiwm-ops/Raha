import logging
import httpx

logger = logging.getLogger(__name__)


async def send_telegram_message(bot_token: str, chat_id: int, text: str) -> bool:
    """Send a Telegram message via Bot API. Shared helper."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url, 
                json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            )
            return resp.status_code == 200 and resp.json().get("ok", False)
    except Exception as exc:
        logger.warning("Failed to send Telegram message to %s: %s", chat_id, exc)
        return False
