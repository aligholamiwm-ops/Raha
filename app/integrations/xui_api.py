import httpx
import json
import logging
from datetime import datetime
from typing import Optional, Any
logger = logging.getLogger(__name__)
# Persistent caches
_cookie_cache: dict[str, str] = {}
_prefix_cache: dict[str, str] = {}
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "X-Requested-With": "XMLHttpRequest",
}
class AsyncXUIClient:
    def __init__(self, base_url: str, username: str, password: str, inbound_id: int, server_name: str, db=None) -> None:
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.inbound_id = inbound_id
        self.server_name = server_name
        self._cookie = _cookie_cache.get(server_name, "")
        self._prefix = _prefix_cache.get(server_name, "")
    def _make_client(self) -> httpx.AsyncClient:
        headers = dict(_HEADERS)
        if self._cookie:
            headers["Cookie"] = self._cookie
        return httpx.AsyncClient(headers=headers, verify=False, timeout=30, follow_redirects=False)
    async def login(self) -> str:
        for prefix in ["", "/xui"]:
            url = f"{self.base_url}{prefix}/login"
            logger.info(f"[{self.server_name}] Attempting login at {url}")
            async with httpx.AsyncClient(headers=_HEADERS, verify=False, timeout=15, follow_redirects=False) as client:
                try:
                    resp = await client.post(url, data={"username": self.username, "password": self.password})
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("success"):
                            self._prefix = prefix
                            _prefix_cache[self.server_name] = prefix
                            cookie = resp.headers.get("set-cookie", "").split(";")[0]
                            if cookie:
                                self._cookie = cookie
                                _cookie_cache[self.server_name] = cookie
                            logger.info(f"[{self.server_name}] Login successful with prefix '{prefix}'")
                            return self._cookie
                except Exception:
                    continue
        raise RuntimeError(f"XUI login failed for {self.server_name}")
    async def _request(self, method: str, path: str, retry_on_401: bool = True, **kwargs) -> httpx.Response:
        if not self._cookie:
            await self.login()
        url = f"{self.base_url}{self._prefix}{path}"
        logger.info(f"[{self.server_name}] Request: {method} {url}")
        async with self._make_client() as client:
            try:
                resp = await client.request(method, url, **kwargs)
                if resp.status_code == 404:
                    logger.warning(f"[{self.server_name}] 404 at {url}, re-detecting prefix...")
                    await self.login()
                    url = f"{self.base_url}{self._prefix}{path}"
                    async with self._make_client() as client2:
                        resp = await client2.request(method, url, **kwargs)
                if resp.status_code == 401 and retry_on_401:
                    await self.login()
                    return await self._request(method, path, retry_on_401=False, **kwargs)
                return resp
            except httpx.RequestError as exc:
                logger.error(f"[{self.server_name}] Connection error: {exc}")
                raise RuntimeError(f"Connection error: {exc}")
    async def get_inbounds(self) -> list:
        resp = await self._request("GET", "/panel/api/inbounds/list")
        if resp.status_code == 200:
            obj = resp.json().get("obj")
            return obj if isinstance(obj, list) else []
        return []
    async def add_client(self, inbound_id: int, client_data: dict) -> dict:
        payload = {"id": inbound_id, "settings": json.dumps({"clients": [client_data]})}
        resp = await self._request("POST", "/panel/api/inbounds/addClient", json=payload)
        return resp.json() if resp.status_code == 200 else {"success": False, "msg": f"HTTP {resp.status_code}"}
    async def update_client(self, inbound_id: int, uuid: str, client_data: dict) -> dict:
        payload = {"id": inbound_id, "settings": json.dumps({"clients": [client_data]})}
        resp = await self._request("POST", f"/panel/api/inbounds/updateClient/{uuid}", json=payload)
        return resp.json() if resp.status_code == 200 else {"success": False, "msg": f"HTTP {resp.status_code}"}
    async def delete_client(self, inbound_id: int, uuid: str) -> dict:
        resp = await self._request("POST", f"/panel/api/inbounds/{inbound_id}/delClient/{uuid}")
        return resp.json() if resp.status_code == 200 else {"success": False, "msg": f"HTTP {resp.status_code}"}
    def build_subscription_link(self, sub_id: str) -> str:
        """Build the subscription link URL for a given subId."""
        if not sub_id:
            return ""
        # The true sub link is https://de.sportmail.tk:2096/sub/{subId}
        # We need to extract the domain from base_url and use port 2096
        from urllib.parse import urlparse
        parsed = urlparse(self.base_url)
        domain = parsed.hostname
        return f"https://{domain}:2096/sub/{sub_id}"
    async def get_client_info(self, email: Optional[str] = None) -> list:
        inbounds = await self.get_inbounds()
        clients = []
        # Get traffic stats to include usage data
        traffic_map = {}
        # Try getting all traffic first
        traffic_resp = await self._request("GET", "/panel/api/inbounds/getClientTraffics/all")
        if traffic_resp.status_code == 200:
            data = traffic_resp.json()
            if data.get("success"):
                obj = data.get("obj")
                if isinstance(obj, list):
                    for t in obj:
                        traffic_map[t["email"]] = t
        
        # If 'all' failed or returned nothing, we'll fetch individually inside the loop if needed
        # but for performance, let's try to get the stats from the inbound list itself if available
        # Some versions of 3x-ui include stats in the inbound list's clientStats field
        # Pre-map clientStats from inbounds if available
        inbound_stats_map = {}
        for ib in inbounds:
            stats_list = ib.get("clientStats", [])
            if isinstance(stats_list, list):
                for s in stats_list:
                    inbound_stats_map[s["email"]] = s

        for ib in inbounds:
            try:
                settings_obj = json.loads(ib.get("settings", "{}"))
                clients_list = settings_obj.get("clients")
                if not isinstance(clients_list, list):
                    continue
                for c in clients_list:
                    c_email = c.get("email")
                    if not email or c_email == email:
                        # Map 'id' to 'uuid' as expected by the router
                        c["uuid"] = str(c.get("id", ""))
                        c["inbound_id"] = ib.get("id")
                        
                        # Add traffic data (try traffic_map first, then inbound_stats_map)
                        t_data = traffic_map.get(c_email) or inbound_stats_map.get(c_email, {})
                        
                        # If still no data and we are looking for a specific email, try individual fetch
                        if not t_data and email:
                            ind_resp = await self._request("GET", f"/panel/api/inbounds/getClientTraffics/{email}")
                            if ind_resp.status_code == 200:
                                t_data = ind_resp.json().get("obj", {})

                        c["usage_up"] = float(t_data.get("up", 0))
                        c["usage_down"] = float(t_data.get("down", 0))
                        c["total_gb"] = float(c.get("totalGB", 0)) / (1024 ** 3) if c.get("totalGB") else 0.0
                        c["expiry_time_ms"] = int(c.get("expiryTime", 0))
                        c["enable"] = bool(c.get("enable", True))
                        # Add last online
                        c["last_online"] = int(t_data.get("expiryTime", 0)) if "expiryTime" in t_data else 0
                        # Extract external proxies if any
                        stream_settings = json.loads(ib.get("streamSettings", "{}"))
                        c["external_proxies"] = stream_settings.get("externalProxy", [])
                        c["inbound"] = ib
                        # Build subscription link from subId
                        sub_id = c.get("subId", "")
                        c["subscription_link"] = self.build_subscription_link(sub_id) if sub_id else ""
                        clients.append(c)
            except: continue
        return clients
def build_xui_client(server: dict) -> AsyncXUIClient:
    """Build an AsyncXUIClient from a server config dict (from env)."""
    # Prioritize full URL if provided
    if "url" in server:
        base_url = server["url"].rstrip("/")
    else:
        ip = server.get("ip", server.get("ip_address", ""))
        port = server.get("port", server.get("panel_port", 2053))
        if ip.startswith("http://") or ip.startswith("https://"):
            base_url = f"{ip}:{port}"
        else:
            base_url = f"http://{ip}:{port}"
            
    return AsyncXUIClient(base_url, server["username"], server["password"], int(server.get("inbound_id", 1)), server.get("name", ""))
