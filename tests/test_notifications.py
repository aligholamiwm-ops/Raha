import logging
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.models.notification import Notification, NotificationCategory, NotificationState
from app.main import app

logging.disable(logging.CRITICAL)

TEST_TELEGRAM_ID = 12345
TEST_ADMIN_ID = 99999


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_notification():
    return Notification(
        category=NotificationCategory.deposit,
        title="Deposit Received",
        message="100 USDT deposited",
    )


@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.users = AsyncMock()
    db.users.find_one = AsyncMock()
    db.users.update_one = AsyncMock()
    db.users.find_one_and_update = AsyncMock()
    return db


@pytest.fixture
async def client(mock_db):
    user_doc = {
        "telegram_id": TEST_TELEGRAM_ID,
        "role": "user",
        "notifications": [],
    }
    admin_doc = {
        "telegram_id": TEST_ADMIN_ID,
        "role": "admin",
        "notifications": [],
    }

    async def override_get_db():
        return mock_db

    async def override_get_current_user():
        from app.models.user import UserModel
        return UserModel(**user_doc)

    async def override_require_admin():
        from app.models.user import UserModel
        return UserModel(**admin_doc)

    app.dependency_overrides.clear()
    from app.database import get_database
    from app.dependencies import get_current_user, require_admin
    app.dependency_overrides[get_database] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[require_admin] = override_require_admin

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ── 1. Notification Model ─────────────────────────────────────────────────────

class TestNotificationModel:
    def test_enum_values(self):
        assert NotificationCategory.deposit.value == "deposit"
        assert NotificationCategory.announcement.value == "announcement"
        assert NotificationState.unread.value == "unread"
        assert NotificationState.read.value == "read"

    def test_default_state_is_unread(self, sample_notification):
        assert sample_notification.state == NotificationState.unread
        assert sample_notification.read_at is None

    def test_mark_read_sets_state_and_timestamp(self, sample_notification):
        before = datetime.now(timezone.utc)
        sample_notification.mark_read()
        assert sample_notification.state == NotificationState.read
        assert sample_notification.read_at is not None
        assert sample_notification.read_at >= before

    def test_notification_id_auto_generated(self, sample_notification):
        assert sample_notification.notification_id is not None
        assert isinstance(sample_notification.notification_id, str)

    def test_created_at_auto_set(self, sample_notification):
        assert sample_notification.created_at is not None
        assert isinstance(sample_notification.created_at, datetime)

    def test_severity_optional(self):
        n = Notification(category=NotificationCategory.deposit, title="t", message="m", severity="error")
        assert n.severity == "error"

    def test_metadata_default_empty_dict(self, sample_notification):
        assert sample_notification.metadata == {}

    def test_model_dump_roundtrip(self, sample_notification):
        data = sample_notification.model_dump()
        restored = Notification(**data)
        assert restored.notification_id == sample_notification.notification_id
        assert restored.category == sample_notification.category
        assert restored.state == sample_notification.state


# ── 3. notify_user ────────────────────────────────────────────────────────────

class TestNotifyUser:
    @pytest.mark.asyncio
    async def test_pushes_notification_to_user_doc(self, mock_db):
        mock_db.users.find_one.return_value = {"telegram_id": TEST_TELEGRAM_ID, "notifications": []}
        mock_db.users.update_one.return_value = MagicMock()

        from app.services.notifications import notify_user
        result = await notify_user(
            mock_db, TEST_TELEGRAM_ID,
            category=NotificationCategory.deposit,
            title="Test",
            message="Hello",
        )

        assert result.category == NotificationCategory.deposit
        assert result.title == "Test"
        assert result.state == NotificationState.unread

        mock_db.users.update_one.assert_called_once()
        call_args = mock_db.users.update_one.call_args
        assert call_args[0][0] == {"telegram_id": TEST_TELEGRAM_ID}
        pushed = call_args[0][1]["$push"]["notifications"]
        assert pushed["title"] == "Test"
        assert pushed["category"] == "deposit"

    @pytest.mark.asyncio
    async def test_cap_prunes_to_100_keeping_unread(self, mock_db):
        read_items = [
            Notification(
                notification_id=f"read-{i}",
                category=NotificationCategory.deposit,
                title="Old",
                message="",
                state=NotificationState.read,
                created_at=datetime.now(timezone.utc) - timedelta(hours=i),
            ).model_dump()
            for i in range(60)
        ]
        unread_items = [
            Notification(
                notification_id=f"unread-{i}",
                category=NotificationCategory.announcement,
                title="New",
                message="",
                state=NotificationState.unread,
                created_at=datetime.now(timezone.utc),
            ).model_dump()
            for i in range(50)
        ]
        existing = read_items + unread_items

        mock_db.users.find_one.return_value = {
            "telegram_id": TEST_TELEGRAM_ID,
            "notifications": existing,
        }
        mock_db.users.update_one.return_value = MagicMock()

        from app.services.notifications import notify_user
        result = await notify_user(
            mock_db, TEST_TELEGRAM_ID,
            category=NotificationCategory.deposit,
            title="Newest",
            message="Cap test",
        )

        # Should have called update_one twice: push then prune
        assert mock_db.users.update_one.call_count >= 2

        prune_call = None
        for call in mock_db.users.update_one.call_args_list:
            args = call[0]
            if "$set" in args[1] and "notifications" in args[1]["$set"]:
                prune_call = call
                break

        assert prune_call is not None, "Prune call not found"

        remaining = prune_call[0][1]["$set"]["notifications"]
        assert len(remaining) == 100

        remaining_unread = [n for n in remaining if n["state"] == NotificationState.unread.value]
        remaining_read = [n for n in remaining if n["state"] == NotificationState.read.value]
        assert len(remaining_unread) == 50
        assert len(remaining_read) == 50

        unread_ids = {n["notification_id"] for n in remaining_unread}
        for i in range(50):
            assert f"unread-{i}" in unread_ids

    @pytest.mark.asyncio
    async def test_push_110_keeps_100_all_unread_preserved(self, mock_db):
        items = []
        for i in range(110):
            state = NotificationState.unread if i < 60 else NotificationState.read
            items.append(
                Notification(
                    notification_id=f"n-{i}",
                    category=NotificationCategory.deposit,
                    title=f"Item {i}",
                    message="",
                    state=state,
                    created_at=datetime.now(timezone.utc) - timedelta(minutes=i),
                ).model_dump()
            )

        mock_db.users.find_one.return_value = {
            "telegram_id": TEST_TELEGRAM_ID,
            "notifications": items,
        }
        mock_db.users.update_one.return_value = MagicMock()

        from app.services.notifications import notify_user
        await notify_user(
            mock_db, TEST_TELEGRAM_ID,
            category=NotificationCategory.deposit,
            title="One more",
            message="Push 111th",
        )

        prune_call = None
        for call in mock_db.users.update_one.call_args_list:
            if "$set" in call[0][1].get("notifications", {}) if isinstance(call[0][1].get("notifications"), dict) else "$set" in call[0][1] and "notifications" in call[0][1].get("$set", {}):
                pass
            args = call[0]
            if "$set" in args[1] and "notifications" in args[1]["$set"]:
                prune_call = call
                break

        assert prune_call is not None

        remaining = prune_call[0][1]["$set"]["notifications"]
        assert len(remaining) == 100

        remaining_unread = [n for n in remaining if n["state"] == NotificationState.unread.value]
        assert len(remaining_unread) == 60


# ── 4. mark_read ──────────────────────────────────────────────────────────────

class TestMarkRead:
    def test_mark_read_changes_state_and_sets_read_at(self, sample_notification):
        sample_notification.mark_read()
        assert sample_notification.state == NotificationState.read
        assert sample_notification.read_at is not None

    def test_mark_read_idempotent(self, sample_notification):
        sample_notification.mark_read()
        t1 = sample_notification.read_at
        sample_notification.mark_read()
        assert sample_notification.state == NotificationState.read
        assert sample_notification.read_at >= t1


# ── 5. delete notification ────────────────────────────────────────────────────

class TestDeleteNotification:
    @pytest.mark.asyncio
    async def test_removes_notification_from_array(self, mock_db):
        mock_db.users.update_one.return_value = MagicMock(modified_count=1)

        from app.routers.notifications import delete_notification
        result = await delete_notification(
            notification_id="some-id",
            current_user=MagicMock(telegram_id=TEST_TELEGRAM_ID),
            db=mock_db,
        )
        assert result is None

        mock_db.users.update_one.assert_called_once_with(
            {"telegram_id": TEST_TELEGRAM_ID},
            {"$pull": {"notifications": {"notification_id": "some-id"}}},
        )


# ── 6. clear_read ─────────────────────────────────────────────────────────────

class TestClearRead:
    @pytest.mark.asyncio
    async def test_removes_only_read_items(self, mock_db):
        mock_db.users.update_one.return_value = MagicMock()

        from app.routers.notifications import clear_notifications
        result = await clear_notifications(
            only="read",
            current_user=MagicMock(telegram_id=TEST_TELEGRAM_ID),
            db=mock_db,
        )
        assert result is None

        mock_db.users.update_one.assert_called_once_with(
            {"telegram_id": TEST_TELEGRAM_ID},
            {"$pull": {"notifications": {"state": NotificationState.read.value}}},
        )

    @pytest.mark.asyncio
    async def test_clears_all_when_no_only_param(self, mock_db):
        mock_db.users.update_one.return_value = MagicMock()

        from app.routers.notifications import clear_notifications
        result = await clear_notifications(
            only=None,
            current_user=MagicMock(telegram_id=TEST_TELEGRAM_ID),
            db=mock_db,
        )
        assert result is None

        mock_db.users.update_one.assert_called_once_with(
            {"telegram_id": TEST_TELEGRAM_ID},
            {"$set": {"notifications": []}},
        )


# ── 7. broadcast ──────────────────────────────────────────────────────────────

class _AsyncCursor:
    """Helper: mock MotorCursor that supports async iteration and chaining."""

    def __init__(self, docs):
        self._docs = docs
        self._index = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._index >= len(self._docs):
            raise StopAsyncIteration
        val = self._docs[self._index]
        self._index += 1
        return val

    def sort(self, *args, **kwargs):
        return self

    def skip(self, n):
        return self

    def limit(self, n):
        return self


class TestBroadcast:
    @pytest.mark.asyncio
    async def test_fans_out_notifications(self, mock_db):
        cursor = _AsyncCursor([
            {"telegram_id": 100},
            {"telegram_id": 200},
            {"telegram_id": 300},
        ])
        mock_db.users.find = MagicMock(return_value=cursor)
        mock_db.users.find_one = AsyncMock(return_value={"telegram_id": 100, "notifications": []})
        mock_db.users.update_one = AsyncMock()

        from app.services.notifications import broadcast
        result = await broadcast(
            mock_db, bot_token=None,
            title="System Update",
            message="Scheduled maintenance",
            target="all",
            also_send_telegram=False,
        )

        assert "announcement_id" not in result
        assert result["sent"] == 3
        assert result["failed"] == 0
        assert result["total"] == 3

        assert mock_db.users.update_one.call_count == 3


# ── 8. API Endpoints ──────────────────────────────────────────────────────────

class TestAPIListNotifications:
    @pytest.mark.asyncio
    async def test_returns_correct_structure(self, client, mock_db):
        notif = Notification(
            category=NotificationCategory.deposit,
            title="Test",
            message="Msg",
        ).model_dump()
        mock_db.users.find_one.return_value = {
            "telegram_id": TEST_TELEGRAM_ID,
            "notifications": [notif],
        }

        resp = await client.get("/api/v1/notifications/me")
        assert resp.status_code == 200
        data = resp.json()
        assert "unread_count" in data
        assert "total" in data
        assert "notifications" in data
        assert len(data["notifications"]) == 1
        assert data["notifications"][0]["title"] == "Test"

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_user_doc(self, client, mock_db):
        mock_db.users.find_one.return_value = None
        resp = await client.get("/api/v1/notifications/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["unread_count"] == 0
        assert data["total"] == 0
        assert data["notifications"] == []


class TestAPIMarkRead:
    @pytest.mark.asyncio
    async def test_marks_single_notification_read(self, client, mock_db):
        notif = Notification(
            notification_id="notif-1",
            category=NotificationCategory.deposit,
            title="Test",
            message="Msg",
            state=NotificationState.read,
        ).model_dump()
        mock_db.users.find_one_and_update.return_value = {
            "notifications": [notif],
        }

        resp = await client.put("/api/v1/notifications/me/notif-1/read")
        assert resp.status_code == 200
        data = resp.json()
        assert data["state"] == "read"

    @pytest.mark.asyncio
    async def test_returns_404_when_not_found(self, client, mock_db):
        mock_db.users.find_one_and_update.return_value = None
        resp = await client.put("/api/v1/notifications/me/nonexistent/read")
        assert resp.status_code == 404


class TestAPIMarkAllRead:
    @pytest.mark.asyncio
    async def test_marks_all_read(self, client, mock_db):
        mock_db.users.update_one.return_value = MagicMock(modified_count=3)
        resp = await client.put("/api/v1/notifications/me/read-all")
        assert resp.status_code == 200
        data = resp.json()
        assert data["updated"] == 3


class TestAPIDeleteNotification:
    @pytest.mark.asyncio
    async def test_deletes_notification(self, client, mock_db):
        mock_db.users.update_one.return_value = MagicMock(modified_count=1)
        resp = await client.delete("/api/v1/notifications/me/notif-1")
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_returns_404_when_not_found(self, client, mock_db):
        mock_db.users.update_one.return_value = MagicMock(modified_count=0)
        resp = await client.delete("/api/v1/notifications/me/nonexistent")
        assert resp.status_code == 404


class TestAPIClearRead:
    @pytest.mark.asyncio
    async def test_clear_read(self, client, mock_db):
        mock_db.users.update_one.return_value = MagicMock()
        resp = await client.delete("/api/v1/notifications/me?only=read")
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_clear_all(self, client, mock_db):
        mock_db.users.update_one.return_value = MagicMock()
        resp = await client.delete("/api/v1/notifications/me")
        assert resp.status_code == 204


class TestAPICreateAnnouncement:
    @pytest.mark.asyncio
    async def test_creates_and_fans_out(self, client, mock_db):
        cursor = _AsyncCursor([
            {"telegram_id": 100},
            {"telegram_id": 200},
        ])
        mock_db.users.find = MagicMock(return_value=cursor)
        mock_db.users.find_one = AsyncMock(return_value={"telegram_id": 100, "notifications": []})
        mock_db.users.update_one = AsyncMock()

        resp = await client.post(
            "/api/v1/admin/announcements",
            json={"title": "Test", "message": "Hello", "target": "all"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "announcement_id" not in data
        assert data["sent"] == 2
        assert data["total"] == 2

    @pytest.mark.asyncio
    async def test_requires_message(self, client, mock_db):
        resp = await client.post(
            "/api/v1/admin/announcements",
            json={"title": "Test", "message": "", "target": "all"},
        )
        assert resp.status_code == 400



