"""
Tests for the traffic overview chart fixes covering:
  1. estimateDaysRemaining calculation correctness
  2. 7D window support in usage-history endpoints
  3. InboundHourlyBucket float precision
  4. usage_snapshots creation on config creation
  5. Non-active configs contribute to inbound/server deltas
"""
import logging
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.usage import (
    ConfigHourlyBucket,
    InboundHourlyBucket,
    ConfigUsageDocument,
    ServerUsageDocument,
)

logging.disable(logging.CRITICAL)

BYTES_TO_GB = 1024 ** 3


# Fixture used by TestUsageHistory7DWindow
@pytest.fixture
def mock_db():
    db = MagicMock()
    db.config_usages = MagicMock()
    db.server_usages = MagicMock()
    db.users = MagicMock()
    db.usage_snapshots = MagicMock()
    db.payments = MagicMock()
    db.tickets = MagicMock()
    db.loans = MagicMock()
    db.clean_ips = MagicMock()
    db.plans = MagicMock()
    db.discounts = MagicMock()
    db.referral_settings = MagicMock()
    db.config_status_log = MagicMock()
    db.referral_bonuses = MagicMock()
    db.settings = MagicMock()
    return db


# ──────────────────────────────────────────────────────────────────────────────
# 1. InboundHourlyBucket float precision
# ──────────────────────────────────────────────────────────────────────────────

class TestInboundHourlyBucketFloat:
    def test_field_types_are_float(self):
        b = InboundHourlyBucket()
        assert isinstance(b.u, float)
        assert isinstance(b.d, float)

    def test_defaults_are_zero_float(self):
        b = InboundHourlyBucket()
        assert b.u == 0.0
        assert b.d == 0.0

    def test_accepts_decimal_values(self):
        b = InboundHourlyBucket(u=0.49, d=0.51)
        assert b.u == pytest.approx(0.49)
        assert b.d == pytest.approx(0.51)

    def test_server_usage_document_uses_float_defaults(self):
        doc = ServerUsageDocument(
            server_name="test-server",
            date=datetime(2026, 7, 1, tzinfo=timezone.utc),
        )
        for bucket in doc.hourly_usage:
            assert isinstance(bucket.u, float)
            assert isinstance(bucket.d, float)
            assert bucket.u == 0.0
            assert bucket.d == 0.0

    def test_config_hourly_bucket_still_float(self):
        b = ConfigHourlyBucket(u=0.49, d=0.51)
        assert isinstance(b.u, float)
        assert isinstance(b.d, float)
        assert b.u == pytest.approx(0.49)


# ──────────────────────────────────────────────────────────────────────────────
# 2. 7D window support in usage endpoints
# ──────────────────────────────────────────────────────────────────────────────

class TestUsageHistory7DWindow:
    """Test the backend usage-history endpoints accept 7D window."""

    @pytest.mark.asyncio
    async def test_user_usage_accepts_7d(self, mock_db):
        now = datetime.now(timezone.utc)
        today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        seven_days_ago = today - timedelta(days=6)

        cursor_mock = AsyncMock()
        cursor_mock.to_list = AsyncMock(return_value=[])
        mock_db.config_usages.find.return_value.sort.return_value = cursor_mock

        with patch(
            "app.routers.users.get_current_user",
            return_value=MagicMock(telegram_id=12345),
        ):
            from app.routers.users import get_usage_history

            result = await get_usage_history(
                timeframe="D",
                window="7D",
                config="all",
                current_user=MagicMock(telegram_id=12345),
                db=mock_db,
            )

        assert result == []
        call_args = mock_db.config_usages.find.call_args
        query = call_args[0][0]
        assert "date" in query
        assert "$gte" in query["date"]
        actual_gte = query["date"]["$gte"]
        assert actual_gte.date() == seven_days_ago.date()

    @pytest.mark.asyncio
    async def test_admin_usage_accepts_7d(self, mock_db):
        now = datetime.now(timezone.utc)
        today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        seven_days_ago = today - timedelta(days=6)

        cursor_mock = AsyncMock()
        cursor_mock.to_list = AsyncMock(return_value=[])
        mock_db.config_usages.find.return_value.sort.return_value = cursor_mock

        with patch(
            "app.routers.admin.require_admin",
            return_value=MagicMock(telegram_id=99999),
        ):
            from app.routers.admin import get_admin_user_usage_history

            result = await get_admin_user_usage_history(
                telegram_id=12345,
                timeframe="D",
                window="7D",
                config="all",
                _admin=MagicMock(telegram_id=99999),
                db=mock_db,
            )

        assert result == []
        call_args = mock_db.config_usages.find.call_args
        query = call_args[0][0]
        assert "date" in query
        assert "$gte" in query["date"]
        actual_gte = query["date"]["$gte"]
        assert actual_gte.date() == seven_days_ago.date()

    @pytest.mark.asyncio
    async def test_user_usage_still_accepts_1d_30d(self, mock_db):
        cursor_mock = AsyncMock()
        cursor_mock.to_list = AsyncMock(return_value=[])
        mock_db.config_usages.find.return_value.sort.return_value = cursor_mock

        with patch(
            "app.routers.users.get_current_user",
            return_value=MagicMock(telegram_id=12345),
        ):
            from app.routers.users import get_usage_history

            for window in ["1D", "30D", "all"]:
                await get_usage_history(
                    timeframe="D",
                    window=window,
                    config="all",
                    current_user=MagicMock(telegram_id=12345),
                    db=mock_db,
                )

        assert mock_db.config_usages.find.call_count == 3

    @pytest.mark.asyncio
    async def test_daily_aggregation_sums_all_hours(self, mock_db):
        now = datetime.now(timezone.utc)
        today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

        doc = {
            "date": today,
            "hourly_usage": [
                {"u": 0.5, "d": 0.3}
                for _ in range(24)
            ],
        }

        cursor_mock = AsyncMock()
        cursor_mock.to_list = AsyncMock(return_value=[doc])
        mock_db.config_usages.find.return_value.sort.return_value = cursor_mock

        with patch(
            "app.routers.users.get_current_user",
            return_value=MagicMock(telegram_id=12345),
        ):
            from app.routers.users import get_usage_history

            result = await get_usage_history(
                timeframe="D",
                window="7D",
                config="all",
                current_user=MagicMock(telegram_id=12345),
                db=mock_db,
            )

        assert len(result) == 1
        expected_total = 24 * (0.5 + 0.3)
        assert result[0].gb == pytest.approx(expected_total, rel=1e-4)

    @pytest.mark.asyncio
    async def test_hourly_aggregation_per_hour(self, mock_db):
        now = datetime.now(timezone.utc)
        today = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

        doc = {
            "date": today,
            "hourly_usage": [
                {"u": 1.0, "d": 0.0} if h == 12 else {"u": 0.0, "d": 0.0}
                for h in range(24)
            ],
        }

        cursor_mock = AsyncMock()
        cursor_mock.to_list = AsyncMock(return_value=[doc])
        mock_db.config_usages.find.return_value.sort.return_value = cursor_mock

        with patch(
            "app.routers.users.get_current_user",
            return_value=MagicMock(telegram_id=12345),
        ):
            from app.routers.users import get_usage_history

            result = await get_usage_history(
                timeframe="H",
                window="1D",
                config="all",
                current_user=MagicMock(telegram_id=12345),
                db=mock_db,
            )

        assert len(result) == 24
        zero_count = sum(1 for p in result if p.gb == 0.0)
        one_count = sum(1 for p in result if p.gb == pytest.approx(1.0))
        assert zero_count == 23
        assert one_count == 1


# ──────────────────────────────────────────────────────────────────────────────
# 3. Config creation inserts usage_snapshots
# ──────────────────────────────────────────────────────────────────────────────

class TestCreateConfigSnapshot:
    @pytest.mark.asyncio
    async def test_create_config_inserts_usage_snapshot(self):
        from app.services.config_service import ConfigService

        settings = MagicMock()
        settings.get_enabled_servers.return_value = [
            {
                "name": "s1",
                "url": "https://panel.example.com:2053",
                "api_token": "tok",
                "inbound_id": 1,
                "status": "enabled",
            }
        ]

        mock_xui = AsyncMock()
        mock_xui.add_client_to_inbounds = AsyncMock(
            return_value={"success": True, "msg": "ok"}
        )
        mock_xui.get_inbound_map = AsyncMock(
            return_value={1: {"id": 1, "remark": "inbound-1", "port": 443, "protocol": "vless"}}
        )
        mock_xui.build_subscription_link = AsyncMock(
            return_value="https://panel.example.com:2053/sub/sub-xyz"
        )

        db = AsyncMock()
        db.users = AsyncMock()
        db.users.find_one = AsyncMock(return_value={"traffic_balance_gb": 100.0, "wallet_balance_usd": 50.0})
        db.users.update_one = AsyncMock()
        db.config_usages = AsyncMock()
        db.config_usages.update_one = AsyncMock()
        db.config_status_log = AsyncMock()
        db.config_status_log.insert_one = AsyncMock()
        db.referral_settings = AsyncMock()
        db.referral_settings.find_one = AsyncMock(return_value={"layers": []})
        db.referral_bonuses = AsyncMock()
        db.referral_bonuses.update_one = AsyncMock()
        db.settings = AsyncMock()
        db.settings.find_one = AsyncMock(return_value=None)

        with patch(
            "app.services.config_service.build_xui_client",
            return_value=mock_xui,
        ):
            svc = ConfigService(db, settings)
            result = await svc.create_config(
                telegram_id=12345,
                name="test",
                total_gb=5.0,
                duration_days=30,
            )

        assert result.uuid is not None
        assert result.email == "12345-test"

        db.usage_snapshots.update_one.assert_called()
        snap_call = db.usage_snapshots.update_one.call_args
        snap_filter = snap_call[0][0]
        snap_update = snap_call[0][1]
        assert snap_filter["uuid"] is not None
        assert snap_update["$set"]["usage_up"] == 0.0
        assert snap_update["$set"]["usage_down"] == 0.0
        assert snap_update["$set"]["client_status"] == "active"


# ──────────────────────────────────────────────────────────────────────────────
# 4. Non-active configs contribute to inbound deltas in track_hourly_usage
# ──────────────────────────────────────────────────────────────────────────────

class TestNonActiveInboundDeltas:
    def test_non_active_code_path_has_inbound_accumulation(self):
        with open("/root/Raha/app/tasks.py") as f:
            source = f.read()

        lines = source.split("\n")

        non_active_start = None
        continues_after = []
        for i, line in enumerate(lines):
            stripped = line.strip()
            if 'if client_status != "active":' in stripped:
                non_active_start = i
            if non_active_start and i > non_active_start:
                if stripped == "continue":
                    continues_after.append(i)

        assert non_active_start is not None, "Non-active block not found"
        assert len(continues_after) >= 2, (
            "Expected at least 2 continues in non-active block "
            "(one for early-skip, one for the end of the non-active path)"
        )

        outer_continue = continues_after[-1]

        between_lines = lines[non_active_start:outer_continue + 1]
        has_inbound = any("inbound_deltas" in line for line in between_lines)
        assert has_inbound, (
            "inbound_deltas accumulation must appear BEFORE continue in non-active path. "
            "Found continues at lines: " + str(continues_after)
        )


# ──────────────────────────────────────────────────────────────────────────────
# 5. ServerUsageChart stats sections in Admin.jsx
# ──────────────────────────────────────────────────────────────────────────────

class TestServerUsageChartStats:
    def test_stats_section_exists(self):
        with open("/root/Raha/frontend/src/pages/Admin.jsx") as f:
            source = f.read()

        assert "Peak" in source
        assert "Average" in source
        assert "Total" in source

        func_start = source.find("function ServerUsageChart")
        assert func_start != -1

        admin_start = source.find("export default function Admin()")
        assert admin_start != -1

        section = source[func_start:admin_start]

        assert "Peak" in section
        assert "Average" in section
        assert "Total" in section
        assert "inboundFormatGB(maxGB)" in section
        assert "totalGB / data.length" in section
        assert "inboundFormatGB(totalGB)" in section

        header_section = section.split("Server Usage")[1] if "Server Usage" in section else ""
        control_section = header_section.split("Server selector")[0] if "Server selector" in header_section else header_section
        assert "total</span>" not in control_section, (
            "Inline total in header should have been removed"
        )


# ──────────────────────────────────────────────────────────────────────────────
# 6. UsageHistogram PERIODS window fix
# ──────────────────────────────────────────────────────────────────────────────

class TestUsageHistogramPeriods:
    def test_periods_have_correct_windows(self):
        with open("/root/Raha/frontend/src/components/UsageHistogram.jsx") as f:
            source = f.read()

        import re
        match = re.search(
            r"const PERIODS\s*=\s*\[(.*?)\]",
            source,
            re.DOTALL,
        )
        assert match

        entries = []
        for entry_match in re.finditer(r"\{(.*?)\}", match.group(1), re.DOTALL):
            entry = {}
            for kv in re.finditer(r"(\w+):\s*'(\w+)'", entry_match.group(1)):
                entry[kv.group(1)] = kv.group(2)
            entries.append(entry)

        assert len(entries) == 3

        week = next(e for e in entries if e["id"] == "7D")
        assert week["window"] == "7D", f"Week should use window=7D, got window={week['window']}"

        month = next(e for e in entries if e["id"] == "30D")
        assert month["window"] == "30D", f"Month should use window=30D, got window={month['window']}"

    def test_no_slice_limit_on_config_pills(self):
        with open("/root/Raha/frontend/src/components/UsageHistogram.jsx") as f:
            source = f.read()

        assert ".slice(0, 8)" not in source, (
            "Config pill slice limit should have been removed"
        )


# ──────────────────────────────────────────────────────────────────────────────
# 7. estimateDaysRemaining correctness
# ──────────────────────────────────────────────────────────────────────────────

class TestEstimateDaysRemainingLogic:
    @staticmethod
    def estimate(configs):
        active = [c for c in configs if c.get("status") == "active"]
        if not active:
            return None

        total_days = 0
        count = 0
        for c in active:
            expiry = c.get("expiry_date")
            if not expiry:
                continue
            if isinstance(expiry, str):
                expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            d = (expiry - datetime.now(timezone.utc)).days
            if d <= 0:
                continue

            used = (c.get("usage_up", 0) + c.get("usage_down", 0)) / BYTES_TO_GB
            remaining = c["total_gb"] - used

            if used <= 0 or remaining <= 0:
                total_days += d
            else:
                estimated_age = (used * d) / remaining
                daily_avg = used / max(estimated_age, 1)
                est = remaining / daily_avg
                total_days += min(max(est, 0), d)
            count += 1

        return round(total_days / count) if count else None

    def test_no_usage_returns_remaining_days(self):
        now = datetime.now(timezone.utc)
        expiry = now + timedelta(days=30)
        configs = [
            {
                "status": "active",
                "total_gb": 50,
                "usage_up": 0,
                "usage_down": 0,
                "expiry_date": expiry,
            }
        ]
        result = self.estimate(configs)
        assert abs(result - 30) <= 1

    def test_half_used_returns_remaining_days_equal_to_original(self):
        now = datetime.now(timezone.utc)
        expiry = now + timedelta(days=35)
        used_bytes = 50 * BYTES_TO_GB
        configs = [
            {
                "status": "active",
                "total_gb": 100,
                "usage_up": used_bytes,
                "usage_down": 0,
                "expiry_date": expiry,
            }
        ]
        result = self.estimate(configs)
        assert abs(result - 35) <= 1

    def test_new_config_with_30pct_used(self):
        now = datetime.now(timezone.utc)
        expiry = now + timedelta(days=70)
        used_bytes = 30 * BYTES_TO_GB
        configs = [
            {
                "status": "active",
                "total_gb": 100,
                "usage_up": used_bytes,
                "usage_down": 0,
                "expiry_date": expiry,
            }
        ]
        result = self.estimate(configs)
        assert abs(result - 70) <= 1

    def test_almost_fully_used_returns_low_days(self):
        now = datetime.now(timezone.utc)
        expiry = now + timedelta(days=60)
        used_bytes = 90 * BYTES_TO_GB
        configs = [
            {
                "status": "active",
                "total_gb": 100,
                "usage_up": used_bytes,
                "usage_down": 0,
                "expiry_date": expiry,
            }
        ]
        result = self.estimate(configs)
        assert abs(result - 60) <= 1

    def test_averages_across_multiple_configs(self):
        now = datetime.now(timezone.utc)
        expiry1 = now + timedelta(days=30)
        expiry2 = now + timedelta(days=60)

        used1 = 10 * BYTES_TO_GB
        used2 = 20 * BYTES_TO_GB

        configs = [
            {
                "status": "active",
                "total_gb": 50,
                "usage_up": used1,
                "usage_down": 0,
                "expiry_date": expiry1,
            },
            {
                "status": "active",
                "total_gb": 80,
                "usage_up": used2,
                "usage_down": 0,
                "expiry_date": expiry2,
            },
        ]
        result = self.estimate(configs)
        assert abs(result - 45) <= 1

    def test_inactive_configs_excluded(self):
        configs = [
            {
                "status": "expired",
                "total_gb": 100,
                "usage_up": 50 * BYTES_TO_GB,
                "usage_down": 0,
                "expiry_date": datetime.now(timezone.utc) + timedelta(days=10),
            },
        ]
        result = self.estimate(configs)
        assert result is None

    def test_js_source_contains_correct_formula(self):
        with open("/root/Raha/frontend/src/pages/Dashboard.jsx") as f:
            source = f.read()

        function_start = source.find("function estimateDaysRemaining")
        func_end = source.find("\n}", function_start)
        func_body = source[function_start:func_end + 1]

        assert "estimatedAgeDays" in func_body, (
            "estimateDaysRemaining should use estimatedAgeDays"
        )
        assert "d > 30" not in func_body, (
            "The old 30-day divisor cap should be removed"
        )
        assert "/ remaining" in func_body, (
            "Formula should compute estimated age using remaining traffic"
        )


# ──────────────────────────────────────────────────────────────────────────────
# 8. track_hourly_usage: empty_hourly_inbound uses float
# ──────────────────────────────────────────────────────────────────────────────

class TestEmptyHourlyFloat:
    def test_empty_hourly_inbound_uses_float_zero(self):
        with open("/root/Raha/app/tasks.py") as f:
            source = f.read()

        import re
        match = re.search(
            r'empty_hourly_inbound\s*=\s*(\[.*?\])',
            source,
            re.DOTALL,
        )
        assert match, "empty_hourly_inbound definition not found"

        content = match.group(1)
        assert "0.0" in content, (
            "empty_hourly_inbound should use float 0.0 (not int 0). Found: " + content[:100]
        )
        assert "'u': 0" not in content.replace(".0", ""), (
            "Should use 0.0, not bare 0, in empty_hourly_inbound"
        )

    def test_server_delta_uses_round_with_precision(self):
        with open("/root/Raha/app/tasks.py") as f:
            source = f.read()

        import re
        match = re.search(
            r'delta_up_gb\s*=\s*round\((.*?)\)',
            source,
        )
        assert match, "delta_up_gb assignment not found"
        assert "2" in match.group(0), (
            "Should use round(..., 2) not round() without precision"
        )
