import httpx
import hashlib
import hmac
import json
import logging

logger = logging.getLogger(__name__)

PLISIO_API_BASE = "https://plisio.net/api/v1"

class PlisioClient:
    def __init__(self, api_key: str, secret_key: str) -> None:
        self.api_key = api_key
        self.secret_key = secret_key

    async def create_invoice(
        self,
        order_name: str,
        order_number: str,
        amount_usd: float,
        callback_url: str,
        email: str = "",
    ) -> dict:
        """Create a crypto payment invoice via Plisio."""
        params: dict = {
            "source_currency": "USD",
            "source_amount": str(round(amount_usd, 2)),
            "order_name": order_name,
            "order_number": order_number,
            "api_key": self.api_key,
            "callback_url": callback_url,
        }
        if email:
            params["email"] = email

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{PLISIO_API_BASE}/invoices/new", params=params)
            resp.raise_for_status()
            return resp.json()

    def verify_webhook(self, raw_body: bytes) -> bool:
        """
        Verify a Plisio IPN/webhook callback.
        """
        try:
            data = json.loads(raw_body)
        except (json.JSONDecodeError, ValueError):
            return False
        verify_hash = data.get("verify_hash")
        if not verify_hash:
            return False
        filtered = {k: v for k, v in data.items() if k != "verify_hash"}
        
        # Try 1: Sorted keys (Plisio standard)
        data_str_sorted = json.dumps(filtered, separators=(",", ":"), sort_keys=True)
        expected_sorted = hashlib.md5(
            (self.secret_key + data_str_sorted).encode("utf-8"),
            usedforsecurity=False,
        ).hexdigest()
        if hmac.compare_digest(expected_sorted, verify_hash):
            return True
            
        # Try 2: Unsorted keys (Original order)
        data_str_unsorted = json.dumps(filtered, separators=(",", ":"))
        expected_unsorted = hashlib.md5(
            (self.secret_key + data_str_unsorted).encode("utf-8"),
            usedforsecurity=False,
        ).hexdigest()
        if hmac.compare_digest(expected_unsorted, verify_hash):
            return True
            
        return False
