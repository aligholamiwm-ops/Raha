"""
Standalone script to remove non-telegram config_usages documents from MongoDB.

Telegram user config emails follow the pattern '{telegram_id}-{custom_name}'.
Any document whose email does not start with a known telegram_id followed by '-'
is considered non-telegram and will be deleted.

Usage:
    python scripts/cleanup_config_usages.py [--dry-run]

Environment variables (loaded from .env by default):
    MONGODB_URL      - MongoDB connection string (default: mongodb://localhost:27017)
    MONGODB_DB_NAME  - Database name (default: raha_vpn)
"""

import argparse
import asyncio
import logging
import os
import re
import sys

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)


async def cleanup(dry_run: bool = False) -> None:
    mongodb_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.getenv("MONGODB_DB_NAME", "raha_vpn")

    client = AsyncIOMotorClient(mongodb_url)
    db = client[db_name]

    try:
        # Collect all known telegram IDs as strings
        telegram_ids: set[str] = set()
        async for user_doc in db.users.find({}, {"telegram_id": 1, "_id": 0}):
            if user_doc.get("telegram_id") is not None:
                telegram_ids.add(str(user_doc["telegram_id"]))

        if not telegram_ids:
            logger.warning("No telegram users found in the database; nothing to delete.")
            return

        logger.info("Found %d telegram user IDs.", len(telegram_ids))

        # Build a regex that matches emails starting with a known telegram_id followed by '-'
        valid_prefixes = [re.escape(tid) + r"-" for tid in telegram_ids]
        combined_pattern = "^(?:" + "|".join(valid_prefixes) + ")"

        filter_query = {"email": {"$not": {"$regex": combined_pattern}}}

        if dry_run:
            count = await db.config_usages.count_documents(filter_query)
            logger.info("[DRY RUN] Would delete %d non-telegram config_usages documents.", count)
        else:
            result = await db.config_usages.delete_many(filter_query)
            logger.info("Deleted %d non-telegram config_usages documents.", result.deleted_count)
    finally:
        client.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Clean non-telegram documents from the config_usages collection."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count matching documents without deleting them.",
    )
    args = parser.parse_args()

    asyncio.run(cleanup(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
