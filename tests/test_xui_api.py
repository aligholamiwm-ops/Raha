"""Comprehensive unit tests for AsyncXUIClient.

Covers Bearer and cookie auth modes, all API endpoints, error handling,
and the Bearer→cookie fallback path.
"""

import json
import logging

import httpx
import pytest
import respx

from app.integrations.xui_api import (
    AsyncXUIClient,
    build_xui_client,
    _build_subscription_url,
    _parse_settings,
)

# Disable logging noise during tests
logging.disable(logging.CRITICAL)

# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

BASE_URL = "https://panel.example.com:2053/xui"


@pytest.fixture
def bearer_client() -> AsyncXUIClient:
    return AsyncXUIClient(
        base_url=BASE_URL,
        api_token="test-bearer-token",
        server_name="bearer-srv",
    )


@pytest.fixture
def cookie_client() -> AsyncXUIClient:
    return AsyncXUIClient(
        base_url=BASE_URL,
        username="admin",
        password="secret",
        server_name="cookie-srv",
    )


@pytest.fixture
def dual_client() -> AsyncXUIClient:
    """Client with both api_token AND username — used to test fallback."""
    return AsyncXUIClient(
        base_url=BASE_URL,
        username="admin",
        password="secret",
        api_token="bad-token",
        server_name="dual-srv",
    )


def _fake_csrf_response(set_cookie: str = "3x-ui=fake-session") -> httpx.Response:
    return httpx.Response(
        200,
        json={"success": True, "obj": "fake-csrf-token"},
        headers={"set-cookie": set_cookie},
    )


def _fake_login_response(
    set_cookie: str = "3x-ui=fake-session-after-login",
) -> httpx.Response:
    return httpx.Response(
        200,
        json={"success": True, "msg": "ok"},
        headers={"set-cookie": set_cookie},
    )


def _fake_api_response(
    obj: object,
    success: bool = True,
    status: int = 200,
) -> httpx.Response:
    return httpx.Response(status, json={"success": success, "msg": "", "obj": obj})


# --------------------------------------------------------------------------- #
# _parse_settings
# --------------------------------------------------------------------------- #

class TestParseSettings:
    def test_dict_passthrough(self):
        assert _parse_settings({"a": 1}) == {"a": 1}

    def test_json_string(self):
        assert _parse_settings('{"a": 1}') == {"a": 1}

    def test_invalid_json_string(self):
        assert _parse_settings("not-json") == {}

    def test_empty_string(self):
        assert _parse_settings("") == {}

    def test_none(self):
        assert _parse_settings(None) == {}


# --------------------------------------------------------------------------- #
# build_xui_client
# --------------------------------------------------------------------------- #

class TestBuildXuiClient:
    def test_with_url(self):
        srv = {
            "name": "s1",
            "url": "https://host:2053/panel/",
            "api_token": "tok",
            "inbound_id": 2,
            "status": "enabled",
        }
        c = build_xui_client(srv)
        assert c.base_url == "https://host:2053/panel"
        assert c.api_token == "tok"
        assert c.inbound_id == 2
        assert c.server_name == "s1"

    def test_with_ip_port_scheme(self):
        srv = {
            "name": "s2",
            "ip": "1.2.3.4",
            "port": 443,
            "scheme": "https",
            "username": "u",
            "password": "p",
            "inbound_id": 1,
        }
        c = build_xui_client(srv)
        assert c.base_url == "https://1.2.3.4:443"
        assert c.username == "u"

    def test_with_scheme_ip_no_scheme(self):
        srv = {"name": "s3", "ip": "1.2.3.4", "port": 2053}
        c = build_xui_client(srv)
        assert c.base_url == "http://1.2.3.4:2053"

    def test_with_http_ip(self):
        srv = {"name": "s4", "ip": "http://1.2.3.4", "port": 2053}
        c = build_xui_client(srv)
        assert c.base_url == "http://1.2.3.4:2053"

    def test_with_sub_port(self):
        srv = {
            "name": "s5",
            "url": "https://host:2053",
            "api_token": "tok",
            "sub_port": 2096,
        }
        c = build_xui_client(srv)
        assert c.sub_port == 2096

    def test_with_sub_uri(self):
        srv = {
            "name": "s6",
            "url": "https://host:2053",
            "api_token": "tok",
            "sub_uri": "https://sub.example.com",
        }
        c = build_xui_client(srv)
        assert c.sub_uri == "https://sub.example.com"


# --------------------------------------------------------------------------- #
# Auth — Bearer mode
# --------------------------------------------------------------------------- #

class TestBearerAuth:
    async def test_login_is_noop(self, bearer_client):
        assert await bearer_client.login() == ""

    @respx.mock
    async def test_request_sends_bearer_header(self, bearer_client):
        route = respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(
            200, json={"success": True, "obj": []}
        )
        await bearer_client.get_inbounds()
        req = route.calls.last.request
        assert req.headers["authorization"] == "Bearer test-bearer-token"

    @respx.mock
    async def test_bearer_401_no_username_returns_empty(self, bearer_client):
        """Bearer 401 without a username/password → caller gets empty list."""
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(401)
        # Remove the username that the fixture doesn't set anyway
        result = await bearer_client.get_inbounds()
        assert result == []


# --------------------------------------------------------------------------- #
# Auth — Cookie mode (CSRF + login flow)
# --------------------------------------------------------------------------- #

class TestCookieAuth:
    @respx.mock
    async def test_login_success(self, cookie_client):
        csrf_route = respx.get(f"{BASE_URL}/csrf-token").respond(
            200,
            json={"success": True, "obj": "csrf123"},
            headers={"set-cookie": "3x-ui=prelogin-cookie"},
        )
        login_route = respx.post(f"{BASE_URL}/login").respond(
            200,
            json={"success": True, "msg": "ok"},
            headers={"set-cookie": "3x-ui=postlogin-cookie"},
        )
        result = await cookie_client.login()
        assert result == "3x-ui=postlogin-cookie"
        assert cookie_client._cookie == "3x-ui=postlogin-cookie"
        assert cookie_client._csrf_token == "csrf123"
        assert cookie_client._prefix == ""

        # Verify the login POST had correct headers and JSON body
        login_req = login_route.calls.last.request
        assert login_req.headers["cookie"] == "3x-ui=prelogin-cookie"
        assert login_req.headers["x-csrf-token"] == "csrf123"
        assert login_req.headers["content-type"] == "application/json"
        assert json.loads(login_req.content) == {
            "username": "admin",
            "password": "secret",
        }

    @respx.mock
    async def test_login_uses_login_cookie_when_set(self, cookie_client):
        """When login response doesn't set a new cookie, fall back to pre-login."""
        respx.get(f"{BASE_URL}/csrf-token").respond(
            200,
            json={"success": True, "obj": "csrf123"},
            headers={"set-cookie": "3x-ui=pre-cookie"},
        )
        respx.post(f"{BASE_URL}/login").respond(
            200, json={"success": True, "msg": "ok"}
        )
        result = await cookie_client.login()
        assert result == "3x-ui=pre-cookie"

    @respx.mock
    async def test_login_csrf_failure_tries_next_prefix(self, cookie_client):
        client = AsyncXUIClient(
            base_url=BASE_URL,
            username="admin",
            password="secret",
            server_name="prefix-srv",
        )
        # First prefix fails CSRF, second succeeds
        respx.get(f"{BASE_URL}/csrf-token").respond(404)
        respx.get(f"{BASE_URL}/xui/csrf-token").respond(
            200,
            json={"success": True, "obj": "csrf456"},
            headers={"set-cookie": "3x-ui=cookie"},
        )
        respx.post(f"{BASE_URL}/xui/login").respond(
            200,
            json={"success": True, "msg": "ok"},
            headers={"set-cookie": "3x-ui=post-cookie"},
        )
        result = await client.login()
        assert result == "3x-ui=post-cookie"
        assert client._prefix == "/xui"

    @respx.mock
    async def test_login_all_prefixes_fail_raises(self, cookie_client):
        respx.get(f"{BASE_URL}/csrf-token").respond(404)
        respx.get(f"{BASE_URL}/xui/csrf-token").respond(404)
        with pytest.raises(RuntimeError, match="XUI login failed"):
            await cookie_client.login()

    @respx.mock
    async def test_cookie_sent_on_api_request(self, cookie_client):
        respx.get(f"{BASE_URL}/csrf-token").respond(
            200,
            json={"success": True, "obj": "csrf"},
            headers={"set-cookie": "3x-ui=sess"},
        )
        respx.post(f"{BASE_URL}/login").respond(
            200,
            json={"success": True, "msg": "ok"},
            headers={"set-cookie": "3x-ui=sess"},
        )
        route = respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(
            200, json={"success": True, "obj": []}
        )
        await cookie_client.get_inbounds()
        req = route.calls.last.request
        assert req.headers["cookie"] == "3x-ui=sess"
        assert req.headers["x-csrf-token"] == "csrf"

    @respx.mock
    async def test_cookie_401_retries_login(self, cookie_client):
        """Cookie-mode 401 triggers re-login before retrying."""
        respx.get(f"{BASE_URL}/csrf-token").respond(
            200,
            json={"success": True, "obj": "csrf"},
            headers={"set-cookie": "3x-ui=sess1"},
        )
        respx.post(f"{BASE_URL}/login").respond(
            200,
            json={"success": True, "msg": "ok"},
            headers={"set-cookie": "3x-ui=sess1"},
        )
        # First API call → 401 → re-login (same mock responses) → second call → 200
        api = respx.get(f"{BASE_URL}/panel/api/inbounds/list")
        api.side_effect = [
            httpx.Response(401),
            httpx.Response(200, json={"success": True, "obj": [{"id": 1}]}),
        ]
        result = await cookie_client.get_inbounds()
        assert len(result) == 1
        assert result[0]["id"] == 1

    @respx.mock
    async def test_cookie_404_retries_with_new_prefix(self, cookie_client):
        """404 triggers prefix re-detection, then retries the request."""
        # Initial login with prefix "" succeeds once, then fails on re-login
        csrf = respx.get(f"{BASE_URL}/csrf-token")
        csrf.side_effect = [
            httpx.Response(200, json={"success": True, "obj": "csrf"},
                           headers={"set-cookie": "3x-ui=sess"}),
            httpx.Response(401),  # re-login: "" prefix fails
        ]
        login = respx.post(f"{BASE_URL}/login")
        login.side_effect = [
            httpx.Response(200, json={"success": True, "msg": "ok"},
                           headers={"set-cookie": "3x-ui=sess"}),
        ]
        # Re-login with /xui prefix succeeds
        respx.get(f"{BASE_URL}/xui/csrf-token").respond(
            200,
            json={"success": True, "obj": "csrf2"},
            headers={"set-cookie": "3x-ui=sess2"},
        )
        respx.post(f"{BASE_URL}/xui/login").respond(
            200,
            json={"success": True, "msg": "ok"},
            headers={"set-cookie": "3x-ui=sess2"},
        )
        # First request gets 404 (wrong prefix)
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(404)
        # Second request after re-login succeeds (with /xui prefix)
        respx.get(f"{BASE_URL}/xui/panel/api/inbounds/list").respond(
            200, json={"success": True, "obj": [{"id": 2}]}
        )
        result = await cookie_client.get_inbounds()
        assert len(result) == 1
        assert result[0]["id"] == 2


# --------------------------------------------------------------------------- #
# Bearer → Cookie fallback
# --------------------------------------------------------------------------- #

class TestBearerFallback:
    @respx.mock
    async def test_bearer_401_triggers_cookie_login(self, dual_client):
        """Bearer token fails (401) with username available → login with cookie."""
        # First request with Bearer → 401
        api = respx.get(f"{BASE_URL}/panel/api/inbounds/list")
        api.side_effect = [
            httpx.Response(401),  # Bearer fails
            httpx.Response(200, json={"success": True, "obj": [{"id": 99}]}),  # cookie retry
        ]
        # Login flow
        respx.get(f"{BASE_URL}/csrf-token").respond(
            200,
            json={"success": True, "obj": "csrf-fallback"},
            headers={"set-cookie": "3x-ui=fallback-cookie"},
        )
        respx.post(f"{BASE_URL}/login").respond(
            200,
            json={"success": True, "msg": "ok"},
            headers={"set-cookie": "3x-ui=fallback-cookie"},
        )
        result = await dual_client.get_inbounds()
        assert len(result) == 1
        assert result[0]["id"] == 99
        assert dual_client._bearer is False
        assert dual_client._fallback_to_cookie is True

        # Verify first call used Bearer, second used Cookie
        first_req = api.calls[0].request
        second_req = api.calls[1].request
        assert "authorization" in first_req.headers
        assert "cookie" in second_req.headers


# --------------------------------------------------------------------------- #
# API endpoints — Inbounds
# --------------------------------------------------------------------------- #

class TestGetInbounds:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(
            200,
            json={
                "success": True,
                "obj": [
                    {"id": 1, "remark": "in-1", "protocol": "vless"},
                    {"id": 2, "remark": "in-2", "protocol": "trojan"},
                ],
            },
        )
        result = await bearer_client.get_inbounds()
        assert len(result) == 2
        assert result[0]["id"] == 1
        assert result[1]["protocol"] == "trojan"

    @respx.mock
    async def test_non_200_returns_empty_list(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(500)
        assert await bearer_client.get_inbounds() == []

    @respx.mock
    async def test_obj_not_list_returns_empty_list(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(
            200, json={"success": True, "obj": "not-a-list"}
        )
        assert await bearer_client.get_inbounds() == []


class TestGetInboundList:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(
            200,
            json={
                "success": True,
                "obj": [
                    {"id": 1, "remark": "in-1", "protocol": "vless", "port": 443},
                    {"id": 2, "remark": "in-2", "protocol": "trojan", "port": 8443},
                ],
            },
        )
        result = await bearer_client.get_inbound_list()
        assert len(result) == 2
        assert result[0]["id"] == 1
        assert result[1]["protocol"] == "trojan"

    @respx.mock
    async def test_non_200_returns_empty_list(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(500)
        assert await bearer_client.get_inbound_list() == []

    @respx.mock
    async def test_inbound_map(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(
            200,
            json={
                "success": True,
                "obj": [
                    {"id": 1, "remark": "VLESS-443", "protocol": "vless"},
                    {"id": 2, "remark": "Trojan-8443", "protocol": "trojan"},
                ],
            },
        )
        result = await bearer_client.get_inbound_map()
        assert len(result) == 2
        assert result[1]["remark"] == "VLESS-443"
        assert result[2]["protocol"] == "trojan"


class TestGetHosts:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/hosts/byInbound/3").respond(
            200,
            json={
                "success": True,
                "obj": [{"id": 1, "remark": "cdn-host", "address": "cdn.example.com"}],
            },
        )
        result = await bearer_client.get_hosts(3)
        assert len(result) == 1
        assert result[0]["address"] == "cdn.example.com"

    @respx.mock
    async def test_non_200_returns_empty_list(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/hosts/byInbound/3").respond(404)
        assert await bearer_client.get_hosts(3) == []


class TestGetInboundSlim:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/list/slim").respond(
            200,
            json={
                "success": True,
                "obj": [
                    {"id": 1, "remark": "in-1", "settings": {"clients": [{"email": "a", "enable": True}]}},
                ],
            },
        )
        result = await bearer_client.get_inbound_slim()
        assert len(result) == 1
        assert result[0]["id"] == 1

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/list/slim").respond(500)
        assert await bearer_client.get_inbound_slim() == []


class TestGetInboundOptions:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/options").respond(
            200,
            json={
                "success": True,
                "obj": [
                    {"id": 1, "remark": "VLESS-443", "protocol": "vless", "port": 443, "tlsFlowCapable": True},
                ],
            },
        )
        result = await bearer_client.get_inbound_options()
        assert len(result) == 1
        assert result[0]["tlsFlowCapable"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/options").respond(500)
        assert await bearer_client.get_inbound_options() == []


class TestGetInbound:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/get/1").respond(
            200,
            json={
                "success": True,
                "obj": {"id": 1, "remark": "VLESS-443", "protocol": "vless", "port": 443},
            },
        )
        result = await bearer_client.get_inbound(1)
        assert result["id"] == 1
        assert result["remark"] == "VLESS-443"

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/get/1").respond(404)
        assert await bearer_client.get_inbound(1) == {}


class TestAddInbound:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/add").respond(
            200, json={"success": True, "msg": "Inbound added"}
        )
        result = await bearer_client.add_inbound({"remark": "new-in", "port": 8080, "protocol": "vmess"})
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/add").respond(400)
        result = await bearer_client.add_inbound({"remark": "new-in"})
        assert result["success"] is False


class TestUpdateInbound:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/update/1").respond(
            200, json={"success": True, "msg": "Inbound updated"}
        )
        result = await bearer_client.update_inbound(1, {"remark": "updated"})
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/update/1").respond(500)
        result = await bearer_client.update_inbound(1, {"remark": "updated"})
        assert result["success"] is False


class TestDeleteInbound:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/del/1").respond(
            200, json={"success": True, "msg": "Inbound deleted"}
        )
        result = await bearer_client.delete_inbound(1)
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/del/1").respond(404)
        result = await bearer_client.delete_inbound(1)
        assert result["success"] is False


class TestBulkDeleteInbounds:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/bulkDel").respond(
            200, json={"success": True, "obj": {"deleted": 2, "skipped": []}}
        )
        result = await bearer_client.bulk_delete_inbounds([1, 2])
        assert result["success"] is True
        assert result["obj"]["deleted"] == 2


class TestSetInboundEnable:
    @respx.mock
    async def test_enable(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/inbounds/setEnable/1").respond(
            200, json={"success": True, "msg": "Inbound enabled"}
        )
        result = await bearer_client.set_inbound_enable(1, True)
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"enable": True}

    @respx.mock
    async def test_disable(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/inbounds/setEnable/2").respond(
            200, json={"success": True, "msg": "Inbound disabled"}
        )
        result = await bearer_client.set_inbound_enable(2, False)
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"enable": False}


class TestResetInboundTraffic:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/1/resetTraffic").respond(
            200, json={"success": True, "msg": "Traffic reset"}
        )
        result = await bearer_client.reset_inbound_traffic(1)
        assert result["success"] is True


class TestDeleteAllInboundClients:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/1/delAllClients").respond(
            200, json={"success": True, "obj": {"deleted": 12}}
        )
        result = await bearer_client.delete_all_inbound_clients(1)
        assert result["success"] is True
        assert result["obj"]["deleted"] == 12


class TestResetAllInboundsTraffic:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/inbounds/resetAllTraffics").respond(
            200, json={"success": True, "msg": "All traffic reset"}
        )
        result = await bearer_client.reset_all_inbounds_traffic()
        assert result["success"] is True


class TestGetInboundFallbacks:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/1/fallbacks").respond(
            200,
            json={
                "success": True,
                "obj": [
                    {"id": 1, "masterId": 10, "childId": 11, "path": "/vlws"},
                ],
            },
        )
        result = await bearer_client.get_inbound_fallbacks(1)
        assert len(result) == 1
        assert result[0]["path"] == "/vlws"

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/1/fallbacks").respond(500)
        assert await bearer_client.get_inbound_fallbacks(1) == []


class TestSetInboundFallbacks:
    @respx.mock
    async def test_success(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/inbounds/1/fallbacks").respond(
            200, json={"success": True, "msg": "Fallbacks updated"}
        )
        fallbacks = [{"childId": 11, "path": "/vlws", "xver": 2}]
        result = await bearer_client.set_inbound_fallbacks(1, fallbacks)
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"fallbacks": fallbacks}


# --------------------------------------------------------------------------- #
# API endpoints — Server
# --------------------------------------------------------------------------- #

class TestGetServerStatus:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/status").respond(
            200,
            json={
                "success": True,
                "obj": {"cpu": 12.5, "mem": {"current": 2147483648, "total": 8589934592}},
            },
        )
        result = await bearer_client.get_server_status()
        assert result["cpu"] == 12.5
        assert result["mem"]["current"] == 2147483648

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/status").respond(500)
        assert await bearer_client.get_server_status() == {}


class TestRestartXray:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/server/restartXrayService").respond(
            200, json={"success": True, "msg": "Xray restarted"}
        )
        result = await bearer_client.restart_xray()
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/server/restartXrayService").respond(400)
        result = await bearer_client.restart_xray()
        assert result["success"] is False


class TestGetXrayVersion:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/getXrayVersion").respond(
            200,
            json={"success": True, "obj": ["v25.10.31", "v25.9.15"]},
        )
        result = await bearer_client.get_xray_version()
        assert len(result) == 2
        assert "v25.10.31" in result

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/getXrayVersion").respond(500)
        assert await bearer_client.get_xray_version() == []


class TestGetConfigJson:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/getConfigJson").respond(
            200,
            json={"success": True, "obj": {"log": {}, "inbounds": [], "outbounds": []}},
        )
        result = await bearer_client.get_config_json()
        assert "inbounds" in result

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/getConfigJson").respond(500)
        assert await bearer_client.get_config_json() == {}


class TestGetAllSettings:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/setting/all").respond(
            200,
            json={
                "success": True,
                "obj": {
                    "subURI": "https://sub.example.com:2096/sssuuubbb",
                    "subPath": "/sssuuubbb/",
                    "subPort": 2096,
                    "subEnable": True,
                },
            },
        )
        result = await bearer_client.get_all_settings()
        assert result["subURI"] == "https://sub.example.com:2096/sssuuubbb"
        assert result["subPath"] == "/sssuuubbb/"
        assert result["subPort"] == 2096

    @respx.mock
    async def test_non_200_returns_empty(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/setting/all").respond(500)
        assert await bearer_client.get_all_settings() == {}

    @respx.mock
    async def test_success_false_returns_empty(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/setting/all").respond(
            200, json={"success": False, "msg": "fail", "obj": None}
        )
        assert await bearer_client.get_all_settings() == {}


class TestEnsureSubSettings:
    @respx.mock
    async def test_caches_settings(self, bearer_client):
        route = respx.get(f"{BASE_URL}/panel/api/setting/all").respond(
            200,
            json={
                "success": True,
                "obj": {
                    "subURI": "https://cache.example.com/sub",
                    "subPath": "/sub/",
                    "subPort": 8443,
                },
            },
        )
        assert bearer_client._panel_settings is None
        await bearer_client._ensure_sub_settings()
        assert bearer_client._panel_settings is not None
        assert bearer_client._panel_settings["subURI"] == "https://cache.example.com/sub"
        # Second call should use cache, not hit API again
        await bearer_client._ensure_sub_settings()
        assert len(route.calls) == 1

    @respx.mock
    async def test_api_error_does_not_raise(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/setting/all").respond(500)
        await bearer_client._ensure_sub_settings()
        assert bearer_client._panel_settings == {}


class TestBuildSubscriptionLink:
    @respx.mock
    async def test_with_sub_uri_from_panel(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/setting/all").respond(
            200,
            json={
                "success": True,
                "obj": {
                    "subURI": "https://panel.example.com:2096/sssuuubbb",
                    "subPath": "/sssuuubbb/",
                    "subPort": 2096,
                },
            },
        )
        link = await bearer_client.build_subscription_link("kn6bgoc7k4pv8mx5")
        assert link == "https://panel.example.com:2096/sssuuubbb/kn6bgoc7k4pv8mx5"

    @respx.mock
    async def test_with_sub_path_from_panel(self, bearer_client):
        client = AsyncXUIClient(
            base_url=BASE_URL,
            api_token="test",
            server_name="path-srv",
        )
        respx.get(f"{BASE_URL}/panel/api/setting/all").respond(
            200,
            json={
                "success": True,
                "obj": {
                    "subURI": "",
                    "subPath": "/customsub/",
                    "subPort": 8443,
                },
            },
        )
        link = await client.build_subscription_link("abc123")
        assert link == "https://panel.example.com:8443/customsub/abc123"

    @respx.mock
    async def test_fallback_when_no_settings(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/setting/all").respond(
            200, json={"success": True, "obj": {}}
        )
        link = await bearer_client.build_subscription_link("abc123")
        assert link == "https://panel.example.com:2096/sub/abc123"

    @respx.mock
    async def test_empty_sub_id(self, bearer_client):
        link = await bearer_client.build_subscription_link("")
        assert link == ""


class TestGetNewUUID:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/getNewUUID").respond(
            200,
            json={"success": True, "obj": "550e8400-e29b-41d4-a716-446655440000"},
        )
        result = await bearer_client.get_new_uuid()
        assert result == "550e8400-e29b-41d4-a716-446655440000"

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/getNewUUID").respond(500)
        assert await bearer_client.get_new_uuid() == ""


class TestGetNewX25519Cert:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/getNewX25519Cert").respond(
            200,
            json={"success": True, "obj": {"privateKey": "priv-key", "publicKey": "pub-key"}},
        )
        result = await bearer_client.get_new_x25519_cert()
        assert result["privateKey"] == "priv-key"
        assert result["publicKey"] == "pub-key"

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/server/getNewX25519Cert").respond(500)
        assert await bearer_client.get_new_x25519_cert() == {}


# --------------------------------------------------------------------------- #
# API endpoints — Hosts CRUD
# --------------------------------------------------------------------------- #

class TestAddHost:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/hosts/add").respond(
            200, json={"success": True, "msg": "Host added"}
        )
        result = await bearer_client.add_host({"remark": "cdn-host", "address": "cdn.example.com", "inboundId": 1})
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/hosts/add").respond(400)
        result = await bearer_client.add_host({"remark": "cdn-host"})
        assert result["success"] is False


class TestUpdateHost:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/hosts/update").respond(
            200, json={"success": True, "msg": "Host updated"}
        )
        result = await bearer_client.update_host({"id": 1, "remark": "updated"})
        assert result["success"] is True


class TestDeleteHost:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/hosts/del/1").respond(
            200, json={"success": True, "msg": "Host deleted"}
        )
        result = await bearer_client.delete_host(1)
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/hosts/del/1").respond(404)
        result = await bearer_client.delete_host(1)
        assert result["success"] is False


# --------------------------------------------------------------------------- #
# API endpoints — Clients CRUD
# --------------------------------------------------------------------------- #

class TestAddClient:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/add").respond(
            200, json={"success": True, "msg": "Client added"}
        )
        result = await bearer_client.add_client(
            1, {"email": "new@test.com", "totalGB": 10000000000}
        )
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/add").respond(500)
        result = await bearer_client.add_client(
            1, {"email": "new@test.com"}
        )
        assert result["success"] is False


class TestAddClientToInbounds:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/add").respond(
            200, json={"success": True, "msg": "Client added"}
        )
        result = await bearer_client.add_client_to_inbounds(
            [1, 2], {"email": "new@test.com", "totalGB": 10000000000}
        )
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/add").respond(500)
        result = await bearer_client.add_client_to_inbounds(
            [1], {"email": "new@test.com"}
        )
        assert result["success"] is False


class TestUpdateClient:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(
            f"{BASE_URL}/panel/api/clients/update/user%40test.com"
        ).respond(200, json={"success": True, "msg": "Client updated"})
        result = await bearer_client.update_client(
            "user@test.com", {"enable": False}
        )
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(
            f"{BASE_URL}/panel/api/clients/update/user%40test.com"
        ).respond(404)
        result = await bearer_client.update_client(
            "user@test.com", {"enable": False}
        )
        assert result["success"] is False


class TestDeleteClient:
    @respx.mock
    async def test_without_keep_traffic(self, bearer_client):
        route = respx.post(
            f"{BASE_URL}/panel/api/clients/del/user%40test.com?keepTraffic=0"
        ).respond(200, json={"success": True, "msg": "Deleted"})
        result = await bearer_client.delete_client("user@test.com")
        assert result["success"] is True
        assert "keepTraffic=0" in str(route.calls.last.request.url)

    @respx.mock
    async def test_with_keep_traffic(self, bearer_client):
        route = respx.post(
            f"{BASE_URL}/panel/api/clients/del/user%40test.com?keepTraffic=1"
        ).respond(200, json={"success": True, "msg": "Deleted"})
        result = await bearer_client.delete_client("user@test.com", keep_traffic=True)
        assert result["success"] is True
        assert "keepTraffic=1" in str(route.calls.last.request.url)

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(
            f"{BASE_URL}/panel/api/clients/del/user%40test.com?keepTraffic=0"
        ).respond(401)
        result = await bearer_client.delete_client("user@test.com")
        assert result["success"] is False


class TestResetClientTraffic:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(
            f"{BASE_URL}/panel/api/clients/resetTraffic/user%40test.com"
        ).respond(200, json={"success": True, "msg": "Reset"})
        result = await bearer_client.reset_client_traffic("user@test.com")
        assert result["success"] is True

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(
            f"{BASE_URL}/panel/api/clients/resetTraffic/user%40test.com"
        ).respond(500)
        result = await bearer_client.reset_client_traffic("user@test.com")
        assert result["success"] is False


# --------------------------------------------------------------------------- #
# API endpoints — Clients read / query
# --------------------------------------------------------------------------- #

class TestGetClientTraffic:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/traffic/user%40test.com"
        ).respond(
            200,
            json={
                "success": True,
                "obj": {
                    "email": "user@test.com",
                    "up": 1024,
                    "down": 2048,
                    "total": 4096,
                },
            },
        )
        result = await bearer_client.get_client_traffic("user@test.com")
        assert result["email"] == "user@test.com"
        assert result["up"] == 1024

    @respx.mock
    async def test_non_200_returns_empty_dict(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/traffic/user%40test.com"
        ).respond(404)
        assert await bearer_client.get_client_traffic("user@test.com") == {}


class TestGetClientLinks:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/links/user%40test.com"
        ).respond(
            200,
            json={
                "success": True,
                "obj": [
                    "vless://uuid@host:443?test#user",
                    "vmess://base64encoded",
                ],
            },
        )
        result = await bearer_client.get_client_links("user@test.com")
        assert len(result) == 2
        assert result[0].startswith("vless://")

    @respx.mock
    async def test_non_200_returns_empty_list(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/links/user%40test.com"
        ).respond(401)
        assert await bearer_client.get_client_links("user@test.com") == []


class TestGetSubLinks:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/subLinks/abc123"
        ).respond(
            200,
            json={"success": True, "obj": ["vless://...", "trojan://..."]},
        )
        result = await bearer_client.get_sub_links("abc123")
        assert len(result) == 2

    async def test_empty_sub_id_returns_early(self, bearer_client):
        assert await bearer_client.get_sub_links("") == []
        assert await bearer_client.get_sub_links(None) == []

    @respx.mock
    async def test_non_200_returns_empty_list(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/subLinks/abc123"
        ).respond(500)
        assert await bearer_client.get_sub_links("abc123") == []


class TestGetOnlineEmails:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/onlines").respond(
            200, json={"success": True, "obj": ["user1", "user2"]}
        )
        result = await bearer_client.get_online_emails()
        assert result == ["user1", "user2"]

    @respx.mock
    async def test_non_200_returns_empty_list(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/onlines").respond(403)
        assert await bearer_client.get_online_emails() == []


class TestGetClientByEmail:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/get/user%40test.com").respond(
            200,
            json={
                "success": True,
                "obj": {"email": "user@test.com", "uuid": "abc-def", "enable": True},
            },
        )
        result = await bearer_client.get_client_by_email("user@test.com")
        assert result["email"] == "user@test.com"
        assert result["uuid"] == "abc-def"

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/get/user%40test.com").respond(404)
        assert await bearer_client.get_client_by_email("user@test.com") == {}


class TestAttachClient:
    @respx.mock
    async def test_success(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/user%40test.com/attach").respond(
            200, json={"success": True, "msg": "Client attached"}
        )
        result = await bearer_client.attach_client("user@test.com", [7, 9])
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"inboundIds": [7, 9]}


class TestDetachClient:
    @respx.mock
    async def test_success(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/user%40test.com/detach").respond(
            200, json={"success": True, "msg": "Client detached"}
        )
        result = await bearer_client.detach_client("user@test.com", [5])
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"inboundIds": [5]}


class TestBulkDeleteClients:
    @respx.mock
    async def test_success(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/bulkDel").respond(
            200, json={"success": True, "obj": {"deleted": 2, "skipped": []}}
        )
        result = await bearer_client.bulk_delete_clients(["alice", "bob"])
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"emails": ["alice", "bob"], "keepTraffic": False}

    @respx.mock
    async def test_with_keep_traffic(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/bulkDel").respond(
            200, json={"success": True, "obj": {"deleted": 1, "skipped": []}}
        )
        result = await bearer_client.bulk_delete_clients(["alice"], keep_traffic=True)
        assert json.loads(route.calls.last.request.content)["keepTraffic"] is True


class TestBulkCreateClients:
    @respx.mock
    async def test_success(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/bulkCreate").respond(
            200, json={"success": True, "obj": {"created": 2, "skipped": []}}
        )
        payload = [
            {"client": {"email": "a@x.com"}, "inboundIds": [1]},
            {"client": {"email": "b@x.com"}, "inboundIds": [1, 2]},
        ]
        result = await bearer_client.bulk_create_clients(payload)
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == payload


class TestBulkEnableDisableClients:
    @respx.mock
    async def test_bulk_enable(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/bulkEnable").respond(
            200, json={"success": True, "obj": {"changed": 2}}
        )
        result = await bearer_client.bulk_enable_clients(["alice", "bob"])
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"emails": ["alice", "bob"]}

    @respx.mock
    async def test_bulk_disable(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/bulkDisable").respond(
            200, json={"success": True, "obj": {"changed": 2}}
        )
        result = await bearer_client.bulk_disable_clients(["alice", "bob"])
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"emails": ["alice", "bob"]}


class TestBulkResetTraffic:
    @respx.mock
    async def test_success(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/bulkResetTraffic").respond(
            200, json={"success": True, "obj": {"affected": 2}}
        )
        result = await bearer_client.bulk_reset_traffic(["alice", "bob"])
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"emails": ["alice", "bob"]}


class TestBulkAdjustClients:
    @respx.mock
    async def test_success(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/bulkAdjust").respond(
            200, json={"success": True, "obj": {"adjusted": 2}}
        )
        result = await bearer_client.bulk_adjust_clients(
            ["alice", "bob"], add_days=30, add_bytes=53687091200, flow="xtls-rprx-vision"
        )
        assert result["success"] is True
        body = json.loads(route.calls.last.request.content)
        assert body["addDays"] == 30
        assert body["addBytes"] == 53687091200
        assert body["flow"] == "xtls-rprx-vision"

    @respx.mock
    async def test_minimal(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/bulkAdjust").respond(
            200, json={"success": True, "obj": {"adjusted": 1}}
        )
        result = await bearer_client.bulk_adjust_clients(["alice"])
        assert result["success"] is True
        body = json.loads(route.calls.last.request.content)
        assert body == {"emails": ["alice"]}


class TestUpdateClientTraffic:
    @respx.mock
    async def test_success(self, bearer_client):
        route = respx.post(f"{BASE_URL}/panel/api/clients/updateTraffic/user%40test.com").respond(
            200, json={"success": True, "msg": "Traffic updated"}
        )
        result = await bearer_client.update_client_traffic("user@test.com", 1024, 2048)
        assert result["success"] is True
        assert json.loads(route.calls.last.request.content) == {"upload": 1024, "download": 2048}


class TestGetClientIps:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/ips/user%40test.com").respond(
            200,
            json={"success": True, "obj": ["1.2.3.4 (1700000000)", "5.6.7.8 (1700000001)"]},
        )
        result = await bearer_client.get_client_ips("user@test.com")
        assert len(result) == 2

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/ips/user%40test.com").respond(500)
        assert await bearer_client.get_client_ips("user@test.com") == []


class TestClearClientIps:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/clearIps/user%40test.com").respond(
            200, json={"success": True, "msg": "IPs cleared"}
        )
        result = await bearer_client.clear_client_ips("user@test.com")
        assert result["success"] is True


class TestGetClientsPaged:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list/paged?page=1&pageSize=25&search=&filter=&protocol=&sort=&order=ascend").respond(
            200,
            json={
                "success": True,
                "obj": {
                    "items": [{"email": "alice", "enable": True}],
                    "total": 1,
                    "page": 1,
                    "pageSize": 25,
                },
            },
        )
        result = await bearer_client.get_clients_paged()
        assert result["total"] == 1
        assert len(result["items"]) == 1

    @respx.mock
    async def test_non_200(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list/paged?page=1&pageSize=25&search=&filter=&protocol=&sort=&order=ascend").respond(
            500
        )
        assert await bearer_client.get_clients_paged() == {}


class TestDeleteDepletedClients:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/delDepleted").respond(
            200, json={"success": True, "obj": {"deleted": 5}}
        )
        result = await bearer_client.delete_depleted_clients()
        assert result["success"] is True
        assert result["obj"]["deleted"] == 5


class TestDeleteOrphanClients:
    @respx.mock
    async def test_success(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/delOrphans").respond(
            200, json={"success": True, "obj": {"deleted": 3}}
        )
        result = await bearer_client.delete_orphan_clients()
        assert result["success"] is True
        assert result["obj"]["deleted"] == 3


# --------------------------------------------------------------------------- #
# get_clients_by_email_prefix
# --------------------------------------------------------------------------- #

class TestGetClientsByEmailPrefix:
    LAST_ONLINE = {
        "success": True,
        "obj": {
            "123-user1": 1_700_000_000,
            "123-user2": 1_700_000_001,
        },
    }

    PAGE_1 = {
        "success": True,
        "obj": {
            "items": [
                {
                    "email": "123-user1", "uuid": "uuid-1", "totalGB": 10 * 1024**3,
                    "expiryTime": 1_800_000_000_000, "enable": True, "subId": "sub-1",
                    "inboundIds": [1],
                    "traffic": {"up": 5000, "down": 10000, "enable": True},
                },
                {
                    "email": "123-user2", "uuid": "uuid-2", "totalGB": 0,
                    "expiryTime": 0, "enable": False, "subId": "",
                    "inboundIds": [1, 2],
                    "traffic": {"up": 100, "down": 200, "enable": True},
                },
            ],
            "total": 2, "page": 1, "pageSize": 100,
        },
    }

    @respx.mock
    async def test_returns_matching_clients(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/list/paged",
            params={"page": 1, "pageSize": 100, "search": "123-", "filter": "", "protocol": "", "sort": "", "order": "ascend"},
        ).respond(200, json=self.PAGE_1)
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json=self.LAST_ONLINE
        )
        result = await bearer_client.get_clients_by_email_prefix("123-")
        assert len(result) == 2
        assert result[0]["email"] == "123-user1"
        assert result[1]["email"] == "123-user2"
        assert result[0]["uuid"] == "uuid-1"
        assert result[0]["total_gb"] == 10.0
        assert result[0]["usage_up"] == 5000
        assert result[0]["usage_down"] == 10000
        assert result[0]["enable"] is True
        assert result[0]["last_online"] == 1_700_000_000_000
        assert result[0]["subscription_link"] == "https://panel.example.com:2096/sub/sub-1"
        assert result[1]["enable"] is False

    @respx.mock
    async def test_empty_prefix_returns_empty(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/list/paged",
            params={"page": 1, "pageSize": 100, "search": "", "filter": "", "protocol": "", "sort": "", "order": "ascend"},
        ).respond(200, json={"success": True, "obj": {"items": [], "total": 0, "page": 1, "pageSize": 100}})
        result = await bearer_client.get_clients_by_email_prefix("")
        assert result == []

    @respx.mock
    async def test_non_200_returns_empty(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/list/paged",
            params={"page": 1, "pageSize": 100, "search": "nonexistent-", "filter": "", "protocol": "", "sort": "", "order": "ascend"},
        ).respond(500)
        result = await bearer_client.get_clients_by_email_prefix("nonexistent-")
        assert result == []

    @respx.mock
    async def test_pagination_iterates_pages(self, bearer_client):
        page1_items = [
            {"email": f"123-user{i}", "uuid": f"uuid-{i}", "totalGB": 1024**3,
             "expiryTime": 0, "enable": True, "subId": "", "inboundIds": [1],
             "traffic": {"up": 0, "down": 0, "enable": True}}
            for i in range(100)
        ]
        page2_items = [
            {"email": f"123-user{i}", "uuid": f"uuid-{i}", "totalGB": 1024**3,
             "expiryTime": 0, "enable": True, "subId": "", "inboundIds": [1],
             "traffic": {"up": 0, "down": 0, "enable": True}}
            for i in range(100, 150)
        ]
        respx.get(
            f"{BASE_URL}/panel/api/clients/list/paged",
            params={"page": 1, "pageSize": 100, "search": "123-", "filter": "", "protocol": "", "sort": "", "order": "ascend"},
        ).respond(200, json={"success": True, "obj": {"items": page1_items, "total": 150, "page": 1, "pageSize": 100}})
        respx.get(
            f"{BASE_URL}/panel/api/clients/list/paged",
            params={"page": 2, "pageSize": 100, "search": "123-", "filter": "", "protocol": "", "sort": "", "order": "ascend"},
        ).respond(200, json={"success": True, "obj": {"items": page2_items, "total": 150, "page": 2, "pageSize": 100}})
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json={"success": True, "obj": {}}
        )
        result = await bearer_client.get_clients_by_email_prefix("123-")
        assert len(result) == 150

    @respx.mock
    async def test_filters_non_matching_results_from_paged(self, bearer_client):
        items = [
            {"email": "123-user1", "uuid": "uuid-1", "totalGB": 1024**3,
             "expiryTime": 0, "enable": True, "subId": "", "inboundIds": [1],
             "traffic": {"up": 0, "down": 0, "enable": True}},
            {"email": "456-other", "uuid": "uuid-2", "totalGB": 1024**3,
             "expiryTime": 0, "enable": True, "subId": "", "inboundIds": [1],
             "traffic": {"up": 0, "down": 0, "enable": True}},
        ]
        respx.get(
            f"{BASE_URL}/panel/api/clients/list/paged",
            params={"page": 1, "pageSize": 100, "search": "123-", "filter": "", "protocol": "", "sort": "", "order": "ascend"},
        ).respond(200, json={"success": True, "obj": {"items": items, "total": 2, "page": 1, "pageSize": 100}})
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json={"success": True, "obj": {}}
        )
        result = await bearer_client.get_clients_by_email_prefix("123-")
        assert len(result) == 1
        assert result[0]["email"] == "123-user1"

    @respx.mock
    async def test_subscription_link_built_from_base_url(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/list/paged",
            params={"page": 1, "pageSize": 100, "search": "123-", "filter": "", "protocol": "", "sort": "", "order": "ascend"},
        ).respond(200, json=self.PAGE_1)
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json=self.LAST_ONLINE
        )
        result = await bearer_client.get_clients_by_email_prefix("123-")
        assert len(result) == 2
        assert result[0]["subId"] == "sub-1"
        assert result[0]["subscription_link"] == "https://panel.example.com:2096/sub/sub-1"
        assert result[1]["subId"] == ""
        assert result[1]["subscription_link"] == ""


# --------------------------------------------------------------------------- #
# get_client_info (complex — combines /clients/list + /clients/lastOnline)
# --------------------------------------------------------------------------- #

class TestGetClientInfo:
    CLIENTS_LIST = {
        "success": True,
        "obj": [
            {
                "email": "alice@test.com",
                "uuid": "uuid-alice",
                "totalGB": 10 * 1024**3,
                "expiryTime": 1_800_000_000_000,
                "enable": True,
                "subId": "sub-alice",
                "inboundIds": [1],
                "traffic": {"up": 5000, "down": 10000, "enable": True},
            },
            {
                "email": "bob@test.com",
                "uuid": "uuid-bob",
                "totalGB": 0,
                "expiryTime": 0,
                "enable": False,
                "subId": "",
                "inboundIds": [1, 2],
                "traffic": {"up": 100, "down": 200, "enable": True},
            },
        ],
    }

    LAST_ONLINE = {
        "success": True,
        "obj": {
            "alice@test.com": 1_700_000_000,
            "bob@test.com": 1_700_000_001,
        },
    }

    @respx.mock
    async def test_all_clients(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list").respond(
            200, json=self.CLIENTS_LIST
        )
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json=self.LAST_ONLINE
        )
        result = await bearer_client.get_client_info()
        assert len(result) == 2

        alice = result[0]
        assert alice["email"] == "alice@test.com"
        assert alice["uuid"] == "uuid-alice"
        assert alice["total_gb"] == 10.0
        assert alice["usage_up"] == 5000
        assert alice["usage_down"] == 10000
        assert alice["enable"] is True
        assert alice["expiry_time_ms"] == 1_800_000_000_000
        assert alice["last_online"] == 1_700_000_000_000  # seconds → ms
        assert alice["subId"] == "sub-alice"
        assert alice["subscription_link"] == "https://panel.example.com:2096/sub/sub-alice"
        assert alice["inbound_id"] == 1
        assert alice["inbound_ids"] == [1]

        bob = result[1]
        assert bob["email"] == "bob@test.com"
        assert bob["total_gb"] == 0.0
        assert bob["enable"] is False
        assert bob["subId"] == ""
        assert bob["subscription_link"] == ""
        assert bob["inbound_id"] == 1  # default — first element of inbound_ids
        assert bob["inbound_ids"] == [1, 2]

    @respx.mock
    async def test_filter_by_email(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list").respond(
            200, json=self.CLIENTS_LIST
        )
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json=self.LAST_ONLINE
        )
        result = await bearer_client.get_client_info(email="bob@test.com")
        assert len(result) == 1
        assert result[0]["email"] == "bob@test.com"

    @respx.mock
    async def test_non_200_returns_empty(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list").respond(500)
        assert await bearer_client.get_client_info() == []

    @respx.mock
    async def test_success_false_returns_empty(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list").respond(
            200, json={"success": False, "msg": "fail", "obj": None}
        )
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json={"success": True, "obj": {}}
        )
        assert await bearer_client.get_client_info() == []

    @respx.mock
    async def test_subscription_link_built_from_base_url(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list").respond(
            200, json=self.CLIENTS_LIST
        )
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json=self.LAST_ONLINE
        )
        result = await bearer_client.get_client_info()
        assert len(result) == 2
        alice = result[0]
        assert alice["subId"] == "sub-alice"
        assert alice["subscription_link"] == "https://panel.example.com:2096/sub/sub-alice"
        bob = result[1]
        assert bob["subId"] == ""
        assert bob["subscription_link"] == ""

    @respx.mock
    async def test_obj_not_list_returns_empty(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list").respond(
            200, json={"success": True, "obj": "not-a-list"}
        )
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json={"success": True, "obj": {}}
        )
        assert await bearer_client.get_client_info() == []

    @respx.mock
    async def test_inbound_names_resolved_from_inbound_map(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list").respond(
            200, json=self.CLIENTS_LIST
        )
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json=self.LAST_ONLINE
        )
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").respond(
            200,
            json={
                "success": True,
                "obj": [
                    {"id": 1, "remark": "VLESS-443", "protocol": "vless"},
                    {"id": 2, "remark": "Trojan-8443", "protocol": "trojan"},
                ],
            },
        )
        result = await bearer_client.get_client_info()
        assert len(result) == 2

        alice = result[0]
        assert alice["inbound_ids"] == [1]
        assert alice["inbound_names"] == ["VLESS-443"]

        bob = result[1]
        assert bob["inbound_ids"] == [1, 2]
        assert bob["inbound_names"] == ["VLESS-443", "Trojan-8443"]


# --------------------------------------------------------------------------- #
# _build_subscription_url (standalone replacement for build_subscription_link)
# --------------------------------------------------------------------------- #

class TestBuildSubscriptionUrl:
    def test_empty_sub_id(self):
        assert _build_subscription_url("https://host:2053", "") == ""
        assert _build_subscription_url("https://host:2053", None) == ""

    def test_with_sub_uri(self):
        link = _build_subscription_url(
            "https://host:2053", "abc123",
            sub_uri="https://sub.example.com/vpn",
        )
        assert link == "https://sub.example.com/vpn/abc123"

    def test_with_sub_port(self):
        link = _build_subscription_url(
            "https://host:2053", "abc123",
            sub_port=8443,
        )
        assert link == "https://host:8443/sub/abc123"

    def test_default_port(self):
        link = _build_subscription_url("https://host:2053", "abc123")
        assert link == "https://host:2096/sub/abc123"

    def test_default_with_localhost(self):
        link = _build_subscription_url("http://localhost:2053", "abc123")
        assert link == "https://localhost:2096/sub/abc123"

    def test_no_domain_returns_empty(self):
        link = _build_subscription_url("not-a-url", "abc123")
        assert link == ""

    def test_with_sub_path(self):
        link = _build_subscription_url(
            "https://host:2053", "abc123",
            sub_path="/sssuuubbb/",
        )
        assert link == "https://host:2096/sssuuubbb/abc123"

    def test_with_sub_path_and_custom_port(self):
        link = _build_subscription_url(
            "https://host:2053", "abc123",
            sub_path="/custom/path/",
            sub_port=8443,
        )
        assert link == "https://host:8443/custom/path/abc123"

    def test_sub_uri_takes_priority_over_sub_path(self):
        link = _build_subscription_url(
            "https://host:2053", "abc123",
            sub_uri="https://override.example.com/custom",
            sub_path="/ignored/",
        )
        assert link == "https://override.example.com/custom/abc123"

    def test_empty_sub_path_falls_back(self):
        link = _build_subscription_url(
            "https://host:2053", "abc123",
            sub_path="",
        )
        assert link == "https://host:2096/sub/abc123"


# --------------------------------------------------------------------------- #
# Exception / error paths
# --------------------------------------------------------------------------- #

class TestConnectionError:
    @respx.mock
    async def test_raises_runtime_error(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/inbounds/list").mock(
            side_effect=httpx.RequestError("connection refused")
        )
        with pytest.raises(RuntimeError, match="Connection error"):
            await bearer_client.get_inbounds()


class TestLoginError:
    @respx.mock
    async def test_raises_on_connection_failure(self, cookie_client):
        respx.get(f"{BASE_URL}/csrf-token").mock(
            side_effect=httpx.RequestError("timeout")
        )
        respx.get(f"{BASE_URL}/xui/csrf-token").mock(
            side_effect=httpx.RequestError("timeout")
        )
        with pytest.raises(RuntimeError, match="XUI login failed"):
            await cookie_client.login()


# --------------------------------------------------------------------------- #
# Online emails cross-referencing (used by tasks.py)
# --------------------------------------------------------------------------- #

class TestGetOnlineEmailsCrossReference:
    @respx.mock
    async def test_online_emails_match_client_list(self, bearer_client):
        respx.get(f"{BASE_URL}/panel/api/clients/list").respond(
            200,
            json={
                "success": True,
                "obj": [
                    {"email": "alice", "uuid": "u1", "totalGB": 0, "expiryTime": 0,
                     "enable": True, "subId": "", "inboundIds": [1],
                     "traffic": {"up": 0, "down": 0, "enable": True}},
                    {"email": "bob", "uuid": "u2", "totalGB": 0, "expiryTime": 0,
                     "enable": False, "subId": "", "inboundIds": [1],
                     "traffic": {"up": 0, "down": 0, "enable": True}},
                    {"email": "carol", "uuid": "u3", "totalGB": 0, "expiryTime": 0,
                     "enable": True, "subId": "", "inboundIds": [1],
                     "traffic": {"up": 0, "down": 0, "enable": True}},
                ],
            },
        )
        respx.post(f"{BASE_URL}/panel/api/clients/lastOnline").respond(
            200, json={"success": True, "obj": {}}
        )
        online_route = respx.post(f"{BASE_URL}/panel/api/clients/onlines").respond(
            200, json={"success": True, "obj": ["alice", "carol"]}
        )
        online_emails = await bearer_client.get_online_emails()
        assert online_emails == ["alice", "carol"]
        assert "alice" in online_emails
        assert "bob" not in online_emails

        # Simulate the cross-reference pattern used in tasks.py
        clients = await bearer_client.get_client_info()
        for c in clients:
            c["is_online"] = c.get("email", "") in online_emails
        assert clients[0]["is_online"] is True  # alice
        assert clients[1]["is_online"] is False  # bob
        assert clients[2]["is_online"] is True  # carol

    @respx.mock
    async def test_online_emails_api_failure_returns_empty(self, bearer_client):
        respx.post(f"{BASE_URL}/panel/api/clients/onlines").respond(500)
        result = await bearer_client.get_online_emails()
        assert result == []


# --------------------------------------------------------------------------- #
# get_client_links (used by config_service for VLESS URI generation)
# --------------------------------------------------------------------------- #

class TestGetClientLinksVlessUri:
    @respx.mock
    async def test_returns_protocol_links(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/links/user%40test.com"
        ).respond(
            200,
            json={
                "success": True,
                "obj": [
                    "vless://uuid@host:443?encryption=none&security=tls#user",
                    "vmess://base64encoded",
                ],
            },
        )
        links = await bearer_client.get_client_links("user@test.com")
        assert len(links) == 2
        assert links[0].startswith("vless://")

    @respx.mock
    async def test_first_link_used_as_vless_uri(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/links/user%40test.com"
        ).respond(
            200,
            json={
                "success": True,
                "obj": [
                    "vless://uuid@proxy.example.com:443?encryption=none&security=tls#user",
                ],
            },
        )
        links = await bearer_client.get_client_links("user@test.com")
        vless_uri = links[0] if links else ""
        assert "vless://" in vless_uri
        assert "proxy.example.com" in vless_uri

    @respx.mock
    async def test_empty_links_returns_empty_string(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/links/user%40test.com"
        ).respond(200, json={"success": True, "obj": []})
        links = await bearer_client.get_client_links("user@test.com")
        assert links == []

    @respx.mock
    async def test_multiple_proxy_links(self, bearer_client):
        respx.get(
            f"{BASE_URL}/panel/api/clients/links/user%40test.com"
        ).respond(
            200,
            json={
                "success": True,
                "obj": [
                    "vless://uuid@proxy1.example.com:443?encryption=none&security=tls#user",
                    "vmess://base64encoded1",
                    "trojan://password@proxy2.example.com:443?security=tls#user",
                ],
            },
        )
        links = await bearer_client.get_client_links("user@test.com")
        assert len(links) == 3
        assert links[0].startswith("vless://")
        assert links[1].startswith("vmess://")
        assert links[2].startswith("trojan://")
        assert "proxy1.example.com" in links[0]
        assert "proxy2.example.com" in links[2]


