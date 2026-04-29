import httpx
import json
import logging
from datetime import datetime
from functools import wraps
from typing import Optional, Any

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
}


class AsyncXUIClient:
    """Async HTTP client for the 3x-ui panel (Sanaei fork)."""

    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        inbound_id: int,
        server_name: str,
        db=None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.inbound_id = inbound_id
        self.server_name = server_name
        self.db = db
        self._cookie: str = ""

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _make_client(self) -> httpx.AsyncClient:
        headers = dict(_HEADERS)
        if self._cookie:
            headers["Cookie"] = self._cookie
        return httpx.AsyncClient(headers=headers, verify=False, timeout=30)

    async def _request(
        self,
        method: str,
        path: str,
        retry_on_401: bool = True,
        **kwargs: Any,
    ) -> httpx.Response:
        url = f"{self.base_url}{path}"
        async with self._make_client() as client:
            response = await client.request(method, url, **kwargs)

        if response.status_code == 401 and retry_on_401:
            logger.warning("Got 401 from %s, re-logging in…", url)
            await self.login()
            async with self._make_client() as client:
                response = await client.request(method, url, **kwargs)

        return response

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    async def login(self) -> str:
        """Authenticate and cache the session cookie. Returns cookie string."""
        async with httpx.AsyncClient(headers=_HEADERS, verify=False, timeout=30) as client:
            response = await client.post(
                f"{self.base_url}/login",
                data={"username": self.username, "password": self.password},
            )

        if response.status_code != 200:
            raise RuntimeError(
                f"XUI login failed with HTTP {response.status_code}"
            )

        data = response.json()
        if not data.get("success"):
            raise RuntimeError(f"XUI login rejected: {data.get('msg')}")

        # Extract Set-Cookie header value
        cookie_header = response.headers.get("set-cookie", "")
        # Grab the first token (session cookie name=value pair)
        self._cookie = cookie_header.split(";")[0] if cookie_header else ""

        if self.db is not None and self._cookie:
            await self.db.servers.update_one(
                {"server_name": self.server_name},
                {"$set": {"cookie": self._cookie}},
            )

        logger.info("XUI login successful for server %s", self.server_name)
        return self._cookie

    def set_cookie(self, cookie: str) -> None:
        """Inject a previously cached cookie (e.g. from MongoDB)."""
        self._cookie = cookie

    # ------------------------------------------------------------------
    # Inbounds
    # ------------------------------------------------------------------

    async def get_inbounds(self) -> list:
        response = await self._request("GET", "/panel/api/inbounds/list")
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                return data.get("obj", [])
        logger.error("get_inbounds failed: %s", response.text)
        return []

    # ------------------------------------------------------------------
    # Client info
    # ------------------------------------------------------------------

    async def get_client_info(self, email: Optional[str] = None) -> list:
        inbounds = await self.get_inbounds()
        client_list = []
        for ib in inbounds:
            try:
                stream_settings = json.loads(ib.get("streamSettings", "{}"))
            except json.JSONDecodeError:
                stream_settings = {}

            domain_name = ""
            tls_settings = (
                stream_settings.get("tlsSettings")
                or stream_settings.get("xtlsSettings")
                or stream_settings.get("realitySettings")
            )
            if tls_settings:
                domain_name = tls_settings.get("serverName", "")

            client_stats = {stat["email"]: stat for stat in ib.get("clientStats", [])}
            try:
                settings = json.loads(ib.get("settings", "{}"))
            except json.JSONDecodeError:
                settings = {}
            clients = settings.get("clients", [])

            for c in clients:
                c_email = c.get("email")
                if email and c_email != email:
                    continue
                stats = client_stats.get(c_email, {})
                client_list.append(
                    {
                        "email": c_email,
                        "uuid": c.get("id"),
                        "enable": c.get("enable", True),
                        "usage_up": stats.get("up", 0),
                        "usage_down": stats.get("down", 0),
                        "total_gb": c.get("totalGB", 0) / (1024**3),
                        "expiry_time_ms": c.get("expiryTime", 0),
                        "domain_name": domain_name,
                        "inbound_id": ib.get("id"),
                        "protocol": ib.get("protocol"),
                    }
                )
        return client_list

    # ------------------------------------------------------------------
    # Client CRUD
    # ------------------------------------------------------------------

    async def add_client(self, inbound_id: int, client_data: dict) -> dict:
        payload = {"id": inbound_id, "settings": json.dumps({"clients": [client_data]})}
        response = await self._request("POST", "/panel/api/inbounds/addClient", json=payload)
        if response.status_code == 200:
            return response.json()
        logger.error("add_client failed: %s", response.text)
        return {"success": False, "msg": response.text}

    async def update_client(self, inbound_id: int, uuid: str, client_data: dict) -> dict:
        payload = {"id": inbound_id, "settings": json.dumps({"clients": [client_data]})}
        response = await self._request(
            "POST", f"/panel/api/inbounds/updateClient/{uuid}", json=payload
        )
        if response.status_code == 200:
            return response.json()
        logger.error("update_client failed: %s", response.text)
        return {"success": False, "msg": response.text}

    async def delete_client(self, inbound_id: int, uuid: str) -> dict:
        response = await self._request(
            "POST", f"/panel/api/inbounds/{inbound_id}/delClient/{uuid}"
        )
        if response.status_code == 200:
            return response.json()
        logger.error("delete_client failed: %s", response.text)
        return {"success": False, "msg": response.text}

    async def reset_client_traffic(self, inbound_id: int, email: str) -> dict:
        response = await self._request(
            "POST", f"/panel/api/inbounds/{inbound_id}/resetClientTraffic/{email}"
        )
        if response.status_code == 200:
            return response.json()
        logger.error("reset_client_traffic failed: %s", response.text)
        return {"success": False, "msg": response.text}

    async def get_client_traffic_by_email(self, email: str) -> dict:
        response = await self._request(
            "GET", f"/panel/api/inbounds/getClientTraffics/{email}"
        )
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                return data.get("obj", {})
        logger.error("get_client_traffic_by_email failed: %s", response.text)
        return {}

    # ------------------------------------------------------------------
    # Static utilities (kept from original)
    # ------------------------------------------------------------------

    @staticmethod
    def timestamp_to_date(ts_ms: int) -> str:
        if not ts_ms or ts_ms <= 0:
            return "Unlimited"
        try:
            dt = datetime.fromtimestamp(ts_ms / 1000.0)
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            return "Invalid Date"

    @staticmethod
    def format_bytes(size: float) -> str:
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if size < 1024.0:
                return f"{size:.2f} {unit}"
            size /= 1024.0
        return f"{size:.2f} PB"
