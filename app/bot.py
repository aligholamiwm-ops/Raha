"""
Telegram bot entrypoint for Raha VPN Mini App.
Run with:  python -m app.bot
"""
import logging
from urllib.parse import quote

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Update,
    WebAppInfo,
)
from telegram.ext import Application, CommandHandler, ContextTypes

from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start — send Mini App launch button with proper WebAppInfo."""
    web_app_url = settings.MINI_APP_URL
    if not web_app_url:
        await update.message.reply_text(
            "⚠️ MINI_APP_URL is not configured. Please set it in .env"
        )
        return

    start_param = context.args[0] if context.args else None
    launch_url = web_app_url
    if start_param:
        sep = "&" if "?" in web_app_url else "?"
        launch_url = f"{web_app_url}{sep}startapp={quote(start_param, safe='')}"

    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    text="🚀 Open Raha VPN",
                    web_app=WebAppInfo(url=launch_url),
                )
            ]
        ]
    )
    await update.message.reply_text(
        "Welcome to Raha VPN! Tap the button below to open the app:",
        reply_markup=keyboard,
    )


async def post_init(application: Application) -> None:
    """Set the persistent menu button to the Web App after bot starts."""
    web_app_url = settings.MINI_APP_URL
    if web_app_url:
        await application.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Open App",
                web_app=WebAppInfo(url=web_app_url),
            )
        )
        logger.info("Menu button set to Web App: %s", web_app_url)


def main() -> None:
    app = (
        Application.builder()
        .token(settings.BOT_TOKEN)
        .post_init(post_init)
        .build()
    )
    app.add_handler(CommandHandler("start", start))
    logger.info("Bot polling started…")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
