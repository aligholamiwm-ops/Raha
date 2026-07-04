"""
Tests for purchase history recording across payment/plan purchase endpoints.
"""
import json
import logging
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, ANY

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app

logging.disable(logging.CRITICAL)

TEST_TELEGRAM_ID = 12345
TEST_ADMIN_ID = 99999
TEST_PLAN_NAME = "1month_10gb"
TEST_PLAN_TRAFFIC = 10.0
TEST_PLAN_PRICE = 5.0


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    db = AsyncMock()

    db.users = AsyncMock()
    db.users.find_one = AsyncMock()
    db.users.find_one.return_value = {
        "telegram_id": TEST_TELEGRAM_ID,
        "referral": {"referrer_id": None, "benefit_type": "usdt", "records": []},
    }
    db.users.update_one = AsyncMock()

    db.settings = AsyncMock()
    db.settings.find_one = AsyncMock()

    def settings_side_effect(filter, *args, **kwargs):
        if filter.get("_id") == "plans":
            return {
                "_id": "plans",
                "items": [{"plan_name": TEST_PLAN_NAME, "traffic_gb": TEST_PLAN_TRAFFIC, "price_usd": TEST_PLAN_PRICE}],
            }
        return None

    db.settings.find_one.side_effect = settings_side_effect

    db.payments = AsyncMock()
    db.payments.find_one = AsyncMock()
    db.payments.insert_one = AsyncMock()
    db.payments.update_one = AsyncMock()

    return db


@pytest.fixture
async def wallet_client(mock_db):
    """Test client with sufficient wallet balance."""
    user_doc = {
        "telegram_id": TEST_TELEGRAM_ID,
        "role": "user",
        "wallet_balance_usd": 100.0,
        "traffic_balance_gb": 0.0,
        "has_used_free_trial": False,
        "referral": {"referrer_id": None, "benefit_type": "usdt", "records": []},
        "purchase_history": [],
        "notifications": [],
    }

    async def override_get_db():
        return mock_db

    async def override_get_current_user():
        from app.models.user import UserModel
        return UserModel(**user_doc)

    app.dependency_overrides.clear()
    from app.database import get_database
    from app.dependencies import get_current_user
    app.dependency_overrides[get_database] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def no_auth_client(mock_db):
    """Test client without auth — for webhook."""

    async def override_get_db():
        return mock_db

    app.dependency_overrides.clear()
    from app.database import get_database
    app.dependency_overrides[get_database] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ── 1. PurchaseRecord model ───────────────────────────────────────────────────

class TestPurchaseRecordModel:
    def test_fields(self):
        from app.models.user import PurchaseRecord
        pr = PurchaseRecord(plan_name="p1", price_usd=9.99, traffic_gb=5.0)
        assert pr.plan_name == "p1"
        assert pr.price_usd == 9.99
        assert pr.traffic_gb == 5.0

    def test_date_auto_set(self):
        from app.models.user import PurchaseRecord
        pr = PurchaseRecord(plan_name="p1", price_usd=9.99, traffic_gb=5.0)
        assert isinstance(pr.date, datetime)
        assert pr.date.tzinfo is not None

    def test_negative_price_raises(self):
        from app.models.user import PurchaseRecord
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            PurchaseRecord(plan_name="p1", price_usd=-1.0, traffic_gb=5.0)

    def test_negative_traffic_raises(self):
        from app.models.user import PurchaseRecord
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            PurchaseRecord(plan_name="p1", price_usd=9.99, traffic_gb=-1.0)

    def test_model_dump_roundtrip(self):
        from app.models.user import PurchaseRecord
        pr = PurchaseRecord(plan_name="p1", price_usd=9.99, traffic_gb=5.0)
        data = pr.model_dump()
        restored = PurchaseRecord(**data)
        assert restored.plan_name == pr.plan_name
        assert restored.price_usd == pr.price_usd
        assert restored.traffic_gb == pr.traffic_gb


# ── 2. create-invoice wallet path ────────────────────────────────────────────

def _find_purchase_history_call(mock_db):
    """Return the $push purchase_history args from update_one calls, or None."""
    for args in mock_db.users.update_one.call_args_list:
        update = args[0][1]
        push = update.get("$push", {})
        if "purchase_history" in push:
            return push["purchase_history"]
    return None

def _find_inc_call(mock_db):
    """Return the $inc args from update_one calls, or None."""
    for args in mock_db.users.update_one.call_args_list:
        update = args[0][1]
        if "$inc" in update:
            return update["$inc"]
    return None


class TestCreateInvoiceWalletPurchase:
    @pytest.mark.asyncio
    async def test_purchase_history_pushed(self, wallet_client, mock_db):
        payload = {"plan_name": TEST_PLAN_NAME, "currency": "USDT"}
        resp = await wallet_client.post("/api/v1/payments/create-invoice", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "wallet_payment"
        assert data["traffic_gb_added"] == TEST_PLAN_TRAFFIC

        record = _find_purchase_history_call(mock_db)
        assert record is not None
        assert record["plan_name"] == TEST_PLAN_NAME
        assert record["price_usd"] == TEST_PLAN_PRICE
        assert record["traffic_gb"] == TEST_PLAN_TRAFFIC
        assert "date" in record

    @pytest.mark.asyncio
    async def test_balance_deducted(self, wallet_client, mock_db):
        payload = {"plan_name": TEST_PLAN_NAME, "currency": "USDT"}
        resp = await wallet_client.post("/api/v1/payments/create-invoice", json=payload)
        assert resp.status_code == 200

        inc = _find_inc_call(mock_db)
        assert inc is not None
        assert inc["wallet_balance_usd"] == -TEST_PLAN_PRICE
        assert inc["traffic_balance_gb"] == TEST_PLAN_TRAFFIC

    @pytest.mark.asyncio
    async def test_wallet_insufficient_returns_invoice(self, mock_db):
        """When wallet is insufficient, create_invoice should create a Plisio invoice
        and NOT push purchase_history."""
        user_doc = {
            "telegram_id": TEST_TELEGRAM_ID,
            "role": "user",
            "wallet_balance_usd": 0.0,
            "traffic_balance_gb": 0.0,
            "has_used_free_trial": False,
            "referral": {"referrer_id": None, "benefit_type": "usdt", "records": []},
            "purchase_history": [],
            "notifications": [],
        }

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            from app.models.user import UserModel
            return UserModel(**user_doc)

        app.dependency_overrides.clear()
        from app.database import get_database
        from app.dependencies import get_current_user
        app.dependency_overrides[get_database] = override_get_db
        app.dependency_overrides[get_current_user] = override_get_current_user

        transport = ASGITransport(app=app)

        # Patch PlisioClient.create_invoice to avoid real HTTP call
        with patch("app.routers.payments.PlisioClient.create_invoice", new_callable=AsyncMock) as mock_plisio:
            mock_plisio.return_value = {
                "status": "success",
                "data": {"txn_id": "plisio-txn", "invoice_url": "https://plisio.net/invoice/abc"},
            }
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                payload = {"plan_name": TEST_PLAN_NAME, "currency": "USDT"}
                resp = await ac.post("/api/v1/payments/create-invoice", json=payload)

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "invoice_created"

        # update_one should not have been called (no wallet deduction)
        mock_db.users.update_one.assert_not_called()

        app.dependency_overrides.clear()


# ── 3. buy_plan_with_wallet ──────────────────────────────────────────────────

class TestBuyPlanWithWallet:
    @pytest.mark.asyncio
    async def test_purchase_history_pushed(self, wallet_client, mock_db):
        resp = await wallet_client.post(f"/api/v1/plans/{TEST_PLAN_NAME}/buy")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"

        mock_db.users.update_one.assert_called_once()
        call_args = mock_db.users.update_one.call_args
        assert call_args[0][0] == {"telegram_id": TEST_TELEGRAM_ID}

        update = call_args[0][1]
        assert "$push" in update
        record = update["$push"]["purchase_history"]
        assert record["plan_name"] == TEST_PLAN_NAME
        assert record["price_usd"] == TEST_PLAN_PRICE
        assert record["traffic_gb"] == TEST_PLAN_TRAFFIC
        assert "date" in record

    @pytest.mark.asyncio
    async def test_balance_deducted(self, wallet_client, mock_db):
        resp = await wallet_client.post(f"/api/v1/plans/{TEST_PLAN_NAME}/buy")
        assert resp.status_code == 200

        call_args = mock_db.users.update_one.call_args
        inc = call_args[0][1]["$inc"]
        assert inc["traffic_balance_gb"] == TEST_PLAN_TRAFFIC
        assert inc["wallet_balance_usd"] == -TEST_PLAN_PRICE

    @pytest.mark.asyncio
    async def test_insufficient_balance_returns_402(self, mock_db):
        user_doc = {
            "telegram_id": TEST_TELEGRAM_ID,
            "role": "user",
            "wallet_balance_usd": 0.0,
            "traffic_balance_gb": 0.0,
            "has_used_free_trial": False,
            "referral": {"referrer_id": None, "benefit_type": "usdt", "records": []},
            "purchase_history": [],
            "notifications": [],
        }

        async def override_get_db():
            return mock_db

        async def override_get_current_user():
            from app.models.user import UserModel
            return UserModel(**user_doc)

        app.dependency_overrides.clear()
        from app.database import get_database
        from app.dependencies import get_current_user
        app.dependency_overrides[get_database] = override_get_db
        app.dependency_overrides[get_current_user] = override_get_current_user

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(f"/api/v1/plans/{TEST_PLAN_NAME}/buy")

        assert resp.status_code == 402
        mock_db.users.update_one.assert_not_called()

        app.dependency_overrides.clear()


# ── 4. Webhook – plan purchase ───────────────────────────────────────────────

class TestWebhookPlanPurchase:
    @pytest.mark.asyncio
    async def test_purchase_history_pushed(self, no_auth_client, mock_db):
        payment_id = "test-payment-plan-001"
        mock_db.payments.find_one.return_value = {
            "payment_id": payment_id,
            "telegram_id": TEST_TELEGRAM_ID,
            "amount_usd": TEST_PLAN_PRICE,
            "traffic_gb": TEST_PLAN_TRAFFIC,
            "plan_name": TEST_PLAN_NAME,
            "status": "pending",
            "type": "plan",
            "discount_code": None,
        }

        payload = {
            "txn_id": "plisio-txn-123",
            "order_number": payment_id,
            "status": "completed",
        }
        resp = await no_auth_client.post(
            "/api/v1/payments/webhook",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

        record = _find_purchase_history_call(mock_db)
        assert record is not None
        assert record["plan_name"] == TEST_PLAN_NAME
        assert record["price_usd"] == TEST_PLAN_PRICE
        assert record["traffic_gb"] == TEST_PLAN_TRAFFIC
        assert "date" in record

    @pytest.mark.asyncio
    async def test_traffic_credited(self, no_auth_client, mock_db):
        payment_id = "test-payment-plan-002"
        mock_db.payments.find_one.return_value = {
            "payment_id": payment_id,
            "telegram_id": TEST_TELEGRAM_ID,
            "amount_usd": TEST_PLAN_PRICE,
            "traffic_gb": TEST_PLAN_TRAFFIC,
            "plan_name": TEST_PLAN_NAME,
            "status": "pending",
            "type": "plan",
            "discount_code": None,
        }

        payload = {
            "txn_id": "plisio-txn-456",
            "order_number": payment_id,
            "status": "completed",
        }
        resp = await no_auth_client.post(
            "/api/v1/payments/webhook",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200

        inc = _find_inc_call(mock_db)
        assert inc is not None
        assert inc["traffic_balance_gb"] == TEST_PLAN_TRAFFIC


# ── 5. Webhook – deposit (traffic_gb=0) ──────────────────────────────────────

class TestWebhookDeposit:
    @pytest.mark.asyncio
    async def test_no_purchase_history(self, no_auth_client, mock_db):
        """Deposit webhook should credit wallet but NOT push purchase_history."""
        payment_id = "test-payment-deposit-001"
        mock_db.payments.find_one.return_value = {
            "payment_id": payment_id,
            "telegram_id": TEST_TELEGRAM_ID,
            "amount_usd": 20.0,
            "traffic_gb": 0.0,
            "plan_name": None,
            "status": "pending",
            "type": "plan",
            "discount_code": None,
        }

        payload = {
            "txn_id": "plisio-txn-deposit",
            "order_number": payment_id,
            "status": "completed",
        }
        resp = await no_auth_client.post(
            "/api/v1/payments/webhook",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200

        # Should have $inc wallet (from the deposit update)
        inc = _find_inc_call(mock_db)
        assert inc is not None
        assert inc["wallet_balance_usd"] == 20.0

        # Should NOT have $push purchase_history
        record = _find_purchase_history_call(mock_db)
        assert record is None


# ── 6. Webhook – loan payment ────────────────────────────────────────────────

class TestWebhookLoan:
    @pytest.mark.asyncio
    async def test_no_purchase_history(self, no_auth_client, mock_db):
        """Loan payment webhook should NOT push purchase_history or inc balance."""
        payment_id = "test-payment-loan-001"
        mock_db.payments.find_one.return_value = {
            "payment_id": payment_id,
            "telegram_id": TEST_TELEGRAM_ID,
            "amount_usd": 50.0,
            "traffic_gb": 0.0,
            "plan_name": None,
            "status": "pending",
            "type": "loan",
            "loan_id": "loan-001",
            "discount_code": None,
        }

        payload = {
            "txn_id": "plisio-txn-loan",
            "order_number": payment_id,
            "status": "completed",
        }
        resp = await no_auth_client.post(
            "/api/v1/payments/webhook",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 200

        # Should NOT have $inc (loan settlement doesn't credit user balance)
        inc = _find_inc_call(mock_db)
        assert inc is None

        # Should NOT have $push purchase_history
        record = _find_purchase_history_call(mock_db)
        assert record is None
