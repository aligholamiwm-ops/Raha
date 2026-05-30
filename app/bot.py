"""
Telegram bot entrypoint for Raha VPN Mini App.
Run with:  python -m app.bot
"""
import logging
from urllib.parse import quote
from datetime import datetime, timezone
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Update,
    WebAppInfo,
)
from telegram.ext import Application, CommandHandler, ContextTypes
from app.config import get_settings
from app.database import connect_db, get_database, close_db
from app.models.user import UserModel, TelegramInfo, ReferralInfo

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


async def _get_profile_photo_url(bot, telegram_id: int) -> str | None:
    """Fetch the user's latest profile photo URL via the Telegram Bot API."""
    try:
        photos = await bot.get_user_profile_photos(telegram_id, limit=1)
        if photos and photos.photos:
            file_id = photos.photos[0][-1].file_id
            file = await bot.get_file(file_id)
            return file.file_path  # Full URL to the photo
    except Exception as exc:
        logger.warning("Could not fetch profile photo for %s: %s", telegram_id, exc)
    return None


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start — send Mini App launch button and auto-create user record."""
    if not update.effective_user:
        return

    user = update.effective_user
    telegram_id = user.id

    # Build TelegramInfo from bot user object
    photo_url = await _get_profile_photo_url(context.bot, telegram_id)
    tg_info = TelegramInfo(
        first_name=user.first_name,
        last_name=user.last_name,
        username=user.username,
        language_code=user.language_code,
        is_premium=bool(getattr(user, "is_premium", False)),
        photo_url=photo_url,
    )

    # Auto-create user record on /start
    try:
        db = get_database()
        doc = await db.users.find_one({"telegram_id": telegram_id})
        if doc is None:
            logger.info(f"Bot: Creating new user with telegram_id={telegram_id}")
            referrer_id = None
            if context.args:
                try:
                    candidate = int(context.args[0])
                    if candidate != telegram_id:
                        ref_doc = await db.users.find_one({"telegram_id": candidate})
                        if ref_doc:
                            referrer_id = candidate
                            logger.info(f"Bot: New user {telegram_id} referred by {referrer_id}")
                except (ValueError, TypeError):
                    pass

            new_user = UserModel(
                telegram_id=telegram_id,
                referral=ReferralInfo(referrer_id=referrer_id),
                telegram_info=tg_info,
                created_at=datetime.now(timezone.utc),
            )
            await db.users.insert_one(new_user.to_dict())
            logger.info(f"Bot: Successfully created user {telegram_id}")
        else:
            # Update telegram info for existing user
            tg_info_update = {k: v for k, v in tg_info.model_dump().items() if v is not None}
            if tg_info_update:
                await db.users.update_one(
                    {"telegram_id": telegram_id},
                    {"$set": {f"telegram_info.{k}": v for k, v in tg_info_update.items()}},
                )
    except Exception as e:
        logger.error(f"Bot: Failed to ensure user record for {telegram_id}: {e}")

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
        f"Welcome to Raha VPN, {user.first_name}! Tap the button below to open the app:",
        reply_markup=keyboard,
    )

async def post_init(application: Application) -> None:
    """Set the persistent menu button to the Web App after bot starts."""
    await connect_db()
    web_app_url = settings.MINI_APP_URL
    if web_app_url:
        await application.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Open App",
                web_app=WebAppInfo(url=web_app_url),
            )
        )
        logger.info("Menu button set to Web App: %s", web_app_url)

async def post_stop(application: Application) -> None:
    """Close database connection on shutdown."""
    await close_db()

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
