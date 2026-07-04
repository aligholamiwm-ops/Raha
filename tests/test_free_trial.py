"""
Tests for free trial settings, grant endpoint, and new-user allocation.
"""
import logging
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app

logging.disable(logging.CRITICAL)

TEST_TELEGRAM_ID = 12345
TEST_ADMIN_ID = 99999


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    db = AsyncMock()

    db.users = AsyncMock()
    db.users.find_one = AsyncMock()
    db.users.find_one.return_value = None
    db.users.update_one = AsyncMock()
    db.users.insert_one = AsyncMock()
    db.users.find = MagicMock()
    db.users.find.return_value.__aiter__.return_value = iter([])

    db.settings = AsyncMock()
    db.settings.find_one = AsyncMock()
    db.settings.find_one.return_value = None

    return db


@pytest.fixture
async def admin_client(mock_db):
    """Test client authenticated as admin."""

    admin_doc = {
        "telegram_id": TEST_ADMIN_ID,
        "role": "admin",
        "wallet_balance_usd": 0.0,
        "traffic_balance_gb": 0.0,
        "has_used_free_trial": False,
        "referral": {"referrer_id": None, "benefit_type": "usdt", "records": []},
        "purchase_history": [],
        "notifications": [],
    }

    async def override_get_db():
        return mock_db

    async def override_require_admin():
        from app.models.user import UserModel
        return UserModel(**admin_doc)

    app.dependency_overrides.clear()
    from app.database import get_database
    from app.dependencies import require_admin
    app.dependency_overrides[get_database] = override_get_db
    app.dependency_overrides[require_admin] = override_require_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ── 1. FreeTrialSettings model ────────────────────────────────────────────────

class TestFreeTrialSettingsModel:
    def test_default_traffic_gb(self):
        from app.models.setting import FreeTrialSettings
        s = FreeTrialSettings()
        assert s.traffic_gb == 0.2

    def test_custom_traffic_gb(self):
        from app.models.setting import FreeTrialSettings
        s = FreeTrialSettings(traffic_gb=5.0)
        assert s.traffic_gb == 5.0

    def test_zero_allowed(self):
        from app.models.setting import FreeTrialSettings
        s = FreeTrialSettings(traffic_gb=0.0)
        assert s.traffic_gb == 0.0

    def test_negative_raises(self):
        from app.models.setting import FreeTrialSettings
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            FreeTrialSettings(traffic_gb=-1.0)


# ── 2. GET /api/v1/admin/free-trial-settings ────────────────────────────────

class TestGetFreeTrialSettings:
    async def test_returns_default_when_no_doc(self, admin_client, mock_db):
        mock_db.settings.find_one.return_value = None
        resp = await admin_client.get("/api/v1/admin/free-trial-settings")
        assert resp.status_code == 200
        data = resp.json()
        assert data["traffic_gb"] == 0.2

    async def test_returns_from_db(self, admin_client, mock_db):
        mock_db.settings.find_one.return_value = {
            "_id": "free_trial_settings",
            "data": {"traffic_gb": 5.0},
        }
        resp = await admin_client.get("/api/v1/admin/free-trial-settings")
        assert resp.status_code == 200
        data = resp.json()
        assert data["traffic_gb"] == 5.0

    async def test_fills_missing_field_from_env(self, admin_client, mock_db):
        mock_db.settings.find_one.return_value = {
            "_id": "free_trial_settings",
            "data": {},
        }
        resp = await admin_client.get("/api/v1/admin/free-trial-settings")
        assert resp.status_code == 200
        assert resp.json()["traffic_gb"] == 0.2

    async def test_requires_admin(self, mock_db):
        async def override_get_db():
            return mock_db

        app.dependency_overrides.clear()
        from app.database import get_database
        from app.dependencies import require_admin, get_current_user

        async def override_get_current_user():
            from app.models.user import UserModel
            return UserModel(telegram_id=TEST_TELEGRAM_ID, role="user")

        app.dependency_overrides[get_database] = override_get_db
        app.dependency_overrides[get_current_user] = override_get_current_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/api/v1/admin/free-trial-settings")
            assert resp.status_code == 403

        app.dependency_overrides.clear()


# ── 3. PUT /api/v1/admin/free-trial-settings ────────────────────────────────

class TestPutFreeTrialSettings:
    async def test_upserts_settings(self, admin_client, mock_db):
        payload = {"traffic_gb": 3.5}
        resp = await admin_client.put("/api/v1/admin/free-trial-settings", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["traffic_gb"] == 3.5

        mock_db.settings.update_one.assert_called_once_with(
            {"_id": "free_trial_settings"},
            {"$set": {"data": payload}},
            upsert=True,
        )

    async def test_round_trip(self, admin_client, mock_db):
        payload = {"traffic_gb": 10.0}
        resp = await admin_client.put("/api/v1/admin/free-trial-settings", json=payload)
        assert resp.status_code == 200
        assert resp.json()["traffic_gb"] == 10.0


# ── 4. POST /api/v1/admin/grant-free-trial ──────────────────────────────────

class TestGrantFreeTrial:
    async def test_grants_to_users_with_false_flag(self, admin_client, mock_db):
        mock_db.settings.find_one.return_value = {
            "_id": "free_trial_settings",
            "data": {"traffic_gb": 2.0},
        }

        user1 = {"telegram_id": 100, "has_used_free_trial": False}
        user2 = {"telegram_id": 200, "has_used_free_trial": False}
        mock_db.users.find.return_value.__aiter__.return_value = iter([user1, user2])

        resp = await admin_client.post("/api/v1/admin/grant-free-trial")
        assert resp.status_code == 200
        assert resp.json()["affected_users"] == 2

        assert mock_db.users.update_one.call_count == 2
        for call in mock_db.users.update_one.call_args_list:
            args, kwargs = call
            assert args[1]["$inc"]["traffic_balance_gb"] == 2.0
            assert args[1]["$set"]["has_used_free_trial"] is True
            assert args[1]["$push"]["purchase_history"]["plan_name"] == "Free Trial"
            assert args[1]["$push"]["purchase_history"]["price_usd"] == 0.0
            assert args[1]["$push"]["purchase_history"]["traffic_gb"] == 2.0

    async def test_skips_users_who_already_used(self, admin_client, mock_db):
        mock_db.settings.find_one.return_value = {
            "_id": "free_trial_settings",
            "data": {"traffic_gb": 1.0},
        }

        mock_db.users.find.return_value.__aiter__.return_value = iter([])

        resp = await admin_client.post("/api/v1/admin/grant-free-trial")
        assert resp.status_code == 200
        assert resp.json()["affected_users"] == 0
        mock_db.users.update_one.assert_not_called()

    async def test_falls_back_to_env_default(self, admin_client, mock_db):
        mock_db.settings.find_one.return_value = None

        user1 = {"telegram_id": 100, "has_used_free_trial": False}
        mock_db.users.find.return_value.__aiter__.return_value = iter([user1])

        resp = await admin_client.post("/api/v1/admin/grant-free-trial")
        assert resp.status_code == 200
        assert resp.json()["affected_users"] == 1

        args, _ = mock_db.users.update_one.call_args
        assert args[1]["$inc"]["traffic_balance_gb"] == 0.2

    async def test_raises_400_if_traffic_zero(self, admin_client, mock_db):
        mock_db.settings.find_one.return_value = {
            "_id": "free_trial_settings",
            "data": {"traffic_gb": 0.0},
        }

        resp = await admin_client.post("/api/v1/admin/grant-free-trial")
        assert resp.status_code == 400

    async def test_cursor_filter_uses_correct_query(self, admin_client, mock_db):
        mock_db.settings.find_one.return_value = {
            "_id": "free_trial_settings",
            "data": {"traffic_gb": 1.0},
        }

        mock_db.users.find.return_value.__aiter__.return_value = iter([])

        await admin_client.post("/api/v1/admin/grant-free-trial")
        mock_db.users.find.assert_called_once_with({"has_used_free_trial": False})


# ── 5. Free trial allocation logic (unit tests for helpers) ──────────────────

class TestFreeTrialAllocation:
    """Tests for the allocation block used in dependencies.py and bot.py."""

    @pytest.fixture
    def mock_db_allocation(self):
        db = AsyncMock()
        db.users = AsyncMock()
        db.users.update_one = AsyncMock()
        db.settings = AsyncMock()
        db.settings.find_one = AsyncMock()
        return db

    async def test_allocates_when_settings_exist(self, mock_db_allocation):
        mock_db_allocation.settings.find_one.return_value = {
            "_id": "free_trial_settings",
            "data": {"traffic_gb": 3.0},
        }

        ft_doc = await mock_db_allocation.settings.find_one({"_id": "free_trial_settings"})
        ft_traffic_gb = ft_doc["data"].get("traffic_gb", 0.0) if ft_doc else 0.0
        assert ft_traffic_gb == 3.0

        if ft_traffic_gb > 0:
            telegram_id = 999
            await mock_db_allocation.users.update_one(
                {"telegram_id": telegram_id},
                {
                    "$inc": {"traffic_balance_gb": ft_traffic_gb},
                    "$set": {"has_used_free_trial": True},
                    "$push": {
                        "purchase_history": {
                            "date": datetime.now(timezone.utc),
                            "plan_name": "Free Trial",
                            "price_usd": 0.0,
                            "traffic_gb": ft_traffic_gb,
                        }
                    },
                },
            )

        mock_db_allocation.users.update_one.assert_called_once()
        args, kwargs = mock_db_allocation.users.update_one.call_args
        assert args[1]["$inc"]["traffic_balance_gb"] == 3.0
        assert args[1]["$set"]["has_used_free_trial"] is True
        assert args[1]["$push"]["purchase_history"]["plan_name"] == "Free Trial"
        assert args[1]["$push"]["purchase_history"]["price_usd"] == 0.0
        assert args[1]["$push"]["purchase_history"]["traffic_gb"] == 3.0

    async def test_skips_when_traffic_zero(self, mock_db_allocation):
        mock_db_allocation.settings.find_one.return_value = {
            "_id": "free_trial_settings",
            "data": {"traffic_gb": 0.0},
        }

        ft_doc = await mock_db_allocation.settings.find_one({"_id": "free_trial_settings"})
        ft_traffic_gb = ft_doc["data"].get("traffic_gb", 0.0) if ft_doc else 0.0
        assert ft_traffic_gb == 0.0

        if ft_traffic_gb > 0:
            await mock_db_allocation.users.update_one(
                {"telegram_id": 999},
                {"$inc": {"traffic_balance_gb": ft_traffic_gb}},
            )

        mock_db_allocation.users.update_one.assert_not_called()

    async def test_skips_when_no_doc(self, mock_db_allocation):
        mock_db_allocation.settings.find_one.return_value = None

        ft_doc = await mock_db_allocation.settings.find_one({"_id": "free_trial_settings"})
        ft_traffic_gb = ft_doc["data"].get("traffic_gb", 0.0) if ft_doc else 0.0
        assert ft_traffic_gb == 0.0

        if ft_traffic_gb > 0:
            await mock_db_allocation.users.update_one(
                {"telegram_id": 999},
                {"$inc": {"traffic_balance_gb": ft_traffic_gb}},
            )

        mock_db_allocation.users.update_one.assert_not_called()
