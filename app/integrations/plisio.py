import httpx
import hashlib
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

    def verify_webhook(self, data: dict) -> bool:
        """
        Verify a Plisio IPN/webhook callback.

        Plisio signs the payload as:
            md5(secret_key + json_sorted_data_without_verify_hash)
        """
        verify_hash = data.get("verify_hash")
        if not verify_hash:
            return False

        filtered = {k: v for k, v in data.items() if k != "verify_hash"}
        data_str = json.dumps(filtered, separators=(",", ":"), sort_keys=True)
        # MD5 is required by the Plisio IPN specification — not our choice.
        # See: https://plisio.net/documentation/endpoints/callbacks
        expected = hashlib.md5(
            (self.secret_key + data_str).encode("utf-8")
        ).hexdigest()
        return expected == verify_hash
