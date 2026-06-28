import logging
from unittest.mock import MagicMock, AsyncMock, patch

import pytest

from app.services.config_service import (
    _normalize_raw_xui_client,
    _parse_telegram_id_from_email,
    ConfigService,
)
from app.config import Settings

logging.disable(logging.CRITICAL)


SAMPLE_SERVER = {
    "name": "s1",
    "url": "https://panel.example.com:2053",
    "api_token": "tok",
    "inbound_id": 1,
    "status": "enabled",
}


# --------------------------------------------------------------------------- #
# _normalize_raw_xui_client
# --------------------------------------------------------------------------- #

class TestNormalizeRawXuiClient:
    def test_normalizes_all_fields(self):
        raw = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 10 * 1024**3,
            "expiryTime": 1_800_000_000_000,
            "inboundIds": [2],
            "subId": "sub-xyz",
            "traffic": {"up": 5000, "down": 10000, "enable": True},
        }
        result = _normalize_raw_xui_client(raw, SAMPLE_SERVER)
        assert result["uuid"] == "uuid-abc"
        assert result["email"] == "12345-myconfig"
        assert result["enable"] is True
        assert result["total_gb"] == 10.0
        assert result["expiry_time_ms"] == 1_800_000_000_000
        assert result["inbound_id"] == 2
        assert result["subId"] == "sub-xyz"
        assert result["usage_up"] == 5000
        assert result["usage_down"] == 10000

    def test_falls_back_to_id_from_uuid(self):
        raw = {"uuid": "uuid-xyz", "email": "1-test"}
        result = _normalize_raw_xui_client(raw, SAMPLE_SERVER)
        assert result["uuid"] == "uuid-xyz"

    def test_falls_back_to_server_inbound_id(self):
        raw = {"email": "1-test"}
        result = _normalize_raw_xui_client(raw, {"inbound_id": 5})
        assert result["inbound_id"] == 5

    def test_zero_total_gb_returns_zero(self):
        raw = {"email": "1-test", "totalGB": 0}
        result = _normalize_raw_xui_client(raw, SAMPLE_SERVER)
        assert result["total_gb"] == 0.0

    def test_missing_total_gb_returns_zero(self):
        raw = {"email": "1-test"}
        result = _normalize_raw_xui_client(raw, SAMPLE_SERVER)
        assert result["total_gb"] == 0.0

    def test_missing_traffic_returns_zero_usage(self):
        raw = {"email": "1-test", "totalGB": 5 * 1024**3}
        result = _normalize_raw_xui_client(raw, SAMPLE_SERVER)
        assert result["usage_up"] == 0.0
        assert result["usage_down"] == 0.0

    def test_empty_traffic_dict_returns_zero_usage(self):
        raw = {"email": "1-test", "totalGB": 5 * 1024**3, "traffic": {}}
        result = _normalize_raw_xui_client(raw, SAMPLE_SERVER)
        assert result["usage_up"] == 0.0
        assert result["usage_down"] == 0.0

    def test_disabled_enable_false(self):
        raw = {"email": "1-test", "enable": False}
        result = _normalize_raw_xui_client(raw, SAMPLE_SERVER)
        assert result["enable"] is False

    def test_expiry_time_ms_capped(self):
        raw = {"email": "1-test", "expiryTime": 999999999999999}
        result = _normalize_raw_xui_client(raw, SAMPLE_SERVER)
        assert result["expiry_time_ms"] == 253402300799000

    def test_last_online_preserved(self):
        raw = {"email": "1-test", "last_online": 1_700_000_000_000}
        result = _normalize_raw_xui_client(raw, SAMPLE_SERVER)
        assert result["last_online"] == 1_700_000_000_000


# --------------------------------------------------------------------------- #
# ConfigService — find_client_by_email
# --------------------------------------------------------------------------- #

class TestFindClientByEmail:
    @pytest.mark.asyncio
    async def test_returns_normalized_client(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 20 * 1024**3,
            "expiryTime": 1_800_000_000_000,
            "inboundIds": [1],
            "subId": "sub-xyz",
            "traffic": {"up": 100, "down": 200},
        }

        db = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            client, server = await svc.find_client_by_email("12345-myconfig")

        assert client is not None
        assert client["uuid"] == "uuid-abc"
        assert client["email"] == "12345-myconfig"
        assert client["total_gb"] == 20.0
        assert client["usage_up"] == 100
        assert client["usage_down"] == 200
        assert client["expiry_time_ms"] == 1_800_000_000_000
        assert client["enable"] is True
        assert server["name"] == "s1"

    @pytest.mark.asyncio
    async def test_handles_xui_client_key_wrapping(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "client": {
                "id": "uuid-xyz",
                "email": "12345-wrapped",
                "enable": True,
                "totalGB": 15 * 1024**3,
                "expiryTime": 0,
                "inboundIds": [1],
                "subId": "",
                "traffic": {"up": 0, "down": 0},
            }
        }

        db = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            client, server = await svc.find_client_by_email("12345-wrapped")

        assert client is not None
        assert client["uuid"] == "uuid-xyz"
        assert client["total_gb"] == 15.0

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {}

        db = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            client, server = await svc.find_client_by_email("nonexistent")

        assert client is None
        assert server is None

    @pytest.mark.asyncio
    async def test_no_servers_returns_none(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = []

        db = AsyncMock()
        svc = ConfigService(db, settings)

        client, server = await svc.find_client_by_email("12345-test")
        assert client is None
        assert server is None


# --------------------------------------------------------------------------- #
# ConfigService — toggle_config
# --------------------------------------------------------------------------- #

class TestToggleConfig:
    @pytest.mark.asyncio
    async def test_toggle_flips_enable_and_updates_xui(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 10 * 1024**3,
            "expiryTime": 0,
            "inboundIds": [1],
            "subId": "sub-xyz",
            "traffic": {"up": 100, "down": 200},
        }
        mock_xui.update_client.return_value = {"success": True, "msg": "ok"}

        db = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            result = await svc.toggle_config("12345-myconfig", telegram_id=12345, role="user")

        assert result.enable is False
        mock_xui.update_client.assert_called_once()
        client_data = mock_xui.update_client.call_args[0][1]
        assert client_data["enable"] is False
        # totalGB should be preserved as 10 GB
        assert client_data["totalGB"] == 10 * 1024**3
        # Status sync call
        db.config_usages.update_one.assert_called()

    @pytest.mark.asyncio
    async def test_toggle_denies_wrong_user(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]
        db = AsyncMock()
        svc = ConfigService(db, settings)

        with pytest.raises(PermissionError, match="Access denied"):
            await svc.toggle_config("99999-other", telegram_id=12345, role="user")


# --------------------------------------------------------------------------- #
# ConfigService — edit_config
# --------------------------------------------------------------------------- #

class TestEditConfig:
    @pytest.mark.asyncio
    async def test_edit_updates_traffic_and_expiry(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 10 * 1024**3,
            "expiryTime": 1_800_000_000_000,
            "inboundIds": [1],
            "subId": "sub-xyz",
            "traffic": {"up": 100, "down": 200},
        }
        mock_xui.update_client.return_value = {"success": True, "msg": "ok"}

        # Mock a collection for users update
        fake_users = AsyncMock()
        fake_users.update_one = AsyncMock()
        fake_users.find_one = AsyncMock(return_value={"traffic_balance_gb": 100.0})

        db = AsyncMock()
        db.users = fake_users
        db.config_usages = AsyncMock()
        db.config_usages.update_one = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            result = await svc.edit_config(
                "12345-myconfig",
                telegram_id=12345,
                role="user",
                name="newname",
                total_gb=20.0,
                duration_days=30,
            )

        assert result.name == "newname"
        assert result.total_gb == 20.0
        # Diff = 20 - 10 = 10, so 10 GB should be deducted
        fake_users.update_one.assert_any_call(
            {"telegram_id": 12345},
            {"$inc": {"traffic_balance_gb": -10.0}},
        )
        mock_xui.update_client.assert_called_once()
        # Should also update usage status
        db.config_usages.update_one.assert_called()

    @pytest.mark.asyncio
    async def test_edit_decrease_traffic_refunds(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 20 * 1024**3,
            "expiryTime": 0,
            "inboundIds": [1],
            "subId": "sub-xyz",
            "traffic": {"up": 0, "down": 0},
        }
        mock_xui.update_client.return_value = {"success": True, "msg": "ok"}

        fake_users = AsyncMock()
        fake_users.update_one = AsyncMock()

        db = AsyncMock()
        db.users = fake_users
        db.config_usages = AsyncMock()
        db.config_usages.update_one = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            result = await svc.edit_config(
                "12345-myconfig",
                telegram_id=12345,
                role="user",
                total_gb=15.0,
            )

        assert result.total_gb == 15.0
        # Diff = 15 - 20 = -5, so 5 GB should be REFUNDED (inc by +5)
        fake_users.update_one.assert_any_call(
            {"telegram_id": 12345},
            {"$inc": {"traffic_balance_gb": 5.0}},
        )

    @pytest.mark.asyncio
    async def test_edit_xui_failure_rolls_back_traffic(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 10 * 1024**3,
            "expiryTime": 0,
            "inboundIds": [1],
            "subId": "sub-xyz",
            "traffic": {"up": 0, "down": 0},
        }
        mock_xui.update_client.return_value = {"success": False, "msg": "XUI error"}

        fake_users = AsyncMock()
        fake_users.find_one = AsyncMock(return_value={"traffic_balance_gb": 100.0})
        db = AsyncMock()
        db.users = fake_users

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            with pytest.raises(RuntimeError, match="XUI error"):
                await svc.edit_config(
                    "12345-myconfig",
                    telegram_id=12345,
                    role="user",
                    total_gb=20.0,
                )

        # Should have deducted then rolled back (deduct 10, add 10 back)
        assert fake_users.update_one.call_count == 2

    @pytest.mark.asyncio
    async def test_edit_raises_when_insufficient_balance(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 10 * 1024**3,
            "expiryTime": 0,
            "inboundIds": [1],
            "subId": "sub-xyz",
            "traffic": {"up": 0, "down": 0},
        }

        db = AsyncMock()
        db.users = AsyncMock()
        # User has only 3 GB balance, needs 10 GB more (diff = 20 - 10 = 10)
        db.users.find_one = AsyncMock(return_value={"traffic_balance_gb": 3.0})
        db.config_usages = AsyncMock()
        db.config_usages.update_one = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            with pytest.raises(ValueError, match="Insufficient traffic balance"):
                await svc.edit_config(
                    "12345-myconfig",
                    telegram_id=12345,
                    role="user",
                    total_gb=20.0,
                )

        db.users.find_one.assert_called_once()
        # No deduction should have happened
        db.users.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_edit_sufficient_balance_succeeds(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 10 * 1024**3,
            "expiryTime": 0,
            "inboundIds": [1],
            "subId": "sub-xyz",
            "traffic": {"up": 0, "down": 0},
        }
        mock_xui.update_client.return_value = {"success": True, "msg": "ok"}

        db = AsyncMock()
        db.users = AsyncMock()
        # User has 15 GB balance, needs 10 GB more (diff = 20 - 10 = 10)
        db.users.find_one = AsyncMock(return_value={"traffic_balance_gb": 15.0})
        db.config_usages = AsyncMock()
        db.config_usages.update_one = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            result = await svc.edit_config(
                "12345-myconfig",
                telegram_id=12345,
                role="user",
                total_gb=20.0,
            )

        assert result.total_gb == 20.0
        db.users.update_one.assert_any_call(
            {"telegram_id": 12345},
            {"$inc": {"traffic_balance_gb": -10.0}},
        )


# --------------------------------------------------------------------------- #
# ConfigService — delete_config
# --------------------------------------------------------------------------- #

class TestDeleteConfig:
    @pytest.mark.asyncio
    async def test_refunds_unused_traffic(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 10 * 1024**3,
            "expiryTime": 0,
            "inboundIds": [1],
            "subId": "sub-xyz",
            "traffic": {"up": 2 * 1024**3, "down": 1 * 1024**3},
        }
        mock_xui.delete_client.return_value = {"success": True, "msg": "Deleted"}

        fake_users = AsyncMock()
        db = AsyncMock()
        db.users = fake_users
        db.config_usages = AsyncMock()
        db.config_usages.update_one = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            await svc.delete_config("12345-myconfig", telegram_id=12345, role="user")

        # Total: 10 GB, Used: 3 GB (2+1), Refund: 7 GB
        fake_users.update_one.assert_called_once_with(
            {"telegram_id": 12345},
            {"$inc": {"traffic_balance_gb": 7.0}},
        )

    @pytest.mark.asyncio
    async def test_no_refund_when_fully_used(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 5 * 1024**3,
            "expiryTime": 0,
            "inboundIds": [1],
            "subId": "",
            "traffic": {"up": 5 * 1024**3, "down": 0},
        }
        mock_xui.delete_client.return_value = {"success": True, "msg": "Deleted"}

        fake_users = AsyncMock()
        db = AsyncMock()
        db.users = fake_users
        db.config_usages = AsyncMock()
        db.config_usages.update_one = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            await svc.delete_config("12345-myconfig", telegram_id=12345, role="user")

        fake_users.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_refund_zero_when_over_used(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 5 * 1024**3,
            "expiryTime": 0,
            "inboundIds": [1],
            "subId": "",
            "traffic": {"up": 6 * 1024**3, "down": 0},
        }
        mock_xui.delete_client.return_value = {"success": True, "msg": "Deleted"}

        fake_users = AsyncMock()
        db = AsyncMock()
        db.users = fake_users
        db.config_usages = AsyncMock()
        db.config_usages.update_one = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            await svc.delete_config("12345-myconfig", telegram_id=12345, role="user")

        fake_users.update_one.assert_not_called()

    @pytest.mark.asyncio
    async def test_marks_status_deleted_in_usage(self):
        settings = MagicMock(spec=Settings)
        settings.get_enabled_servers.return_value = [SAMPLE_SERVER]

        mock_xui = AsyncMock()
        mock_xui.get_client_by_email.return_value = {
            "id": "uuid-abc",
            "email": "12345-myconfig",
            "enable": True,
            "totalGB": 10 * 1024**3,
            "expiryTime": 0,
            "inboundIds": [1],
            "subId": "",
            "traffic": {"up": 0, "down": 0},
        }
        mock_xui.delete_client.return_value = {"success": True, "msg": "Deleted"}

        fake_users = AsyncMock()
        db = AsyncMock()
        db.users = fake_users
        db.config_usages = AsyncMock()
        db.config_usages.update_one = AsyncMock()

        with patch("app.services.config_service.build_xui_client", return_value=mock_xui):
            svc = ConfigService(db, settings)
            await svc.delete_config("12345-myconfig", telegram_id=12345, role="user")

        db.config_usages.update_one.assert_called()
        update_arg = db.config_usages.update_one.call_args[0][1]
        assert update_arg["$set"]["client_status"] == "deleted"
