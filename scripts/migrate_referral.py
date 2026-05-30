"""
Migration: flatten referral fields → embedded ReferralInfo object.

Old schema per user document:
  referrer_id            : int | null
  referral_benefit_type  : "usdt" | "traffic"
  referred_bonus_usd     : float
  referred_bonus_gb      : float

New schema:
  referral:
    referrer_id   : int | null
    benefit_type  : "usdt" | "traffic"
    records       : []   # history is not recoverable from old data; starts empty

Run:
  python -m scripts.migrate_referral
or with a custom MongoDB URL:
  MONGODB_URL=mongodb://... MONGODB_DB_NAME=raha python -m scripts.migrate_referral
"""

import asyncio
import logging
import os

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "raha")


async def migrate() -> None:
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[MONGODB_DB_NAME]

    total = await db.users.count_documents({})
    logger.info("Connected to %s/%s — %d user documents found", MONGODB_URL, MONGODB_DB_NAME, total)

    migrated = 0
    skipped = 0

    async for doc in db.users.find({}):
        tid = doc.get("telegram_id")

        # Already migrated: has a referral sub-document, no flat fields
        if "referral" in doc and "referrer_id" not in doc:
            skipped += 1
            continue

        old_referrer_id = doc.get("referrer_id")
        old_benefit_type = doc.get("referral_benefit_type", "usdt")

        new_referral = {
            "referrer_id": old_referrer_id,
            "benefit_type": old_benefit_type,
            "records": [],
        }

        unset_fields = {
            "referrer_id": "",
            "referral_benefit_type": "",
            "referred_bonus_usd": "",
            "referred_bonus_gb": "",
        }

        await db.users.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {"referral": new_referral},
                "$unset": unset_fields,
            },
        )
        migrated += 1
        logger.debug("Migrated user %s (referrer_id=%s, benefit_type=%s)", tid, old_referrer_id, old_benefit_type)

    client.close()
    logger.info("Migration complete — migrated: %d, already up-to-date: %d", migrated, skipped)


if __name__ == "__main__":
    asyncio.run(migrate())
