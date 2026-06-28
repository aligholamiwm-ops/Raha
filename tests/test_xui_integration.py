"""Integration test for AsyncXUIClient using the real server from .env.

Tests:
  1. Fetching a client by email
  2. Building the subscription link with the correct path
"""

import json
import logging
import os
from urllib.parse import urlparse

import pytest
from dotenv import load_dotenv

from app.integrations.xui_api import build_xui_client

logging.disable(logging.CRITICAL)

load_dotenv()

SERVER_CONFIG_JSON = os.environ.get("SERVERS", "")
SERVER = json.loads(SERVER_CONFIG_JSON)[0] if SERVER_CONFIG_JSON else None


@pytest.mark.skipif(not SERVER, reason="No server config in SERVERS env var")
async def test_get_client_and_subscription_link():
    email = "7348514142-testii"
    expected_sub_id = "kn6bgoc7k4pv8mx5"
    expected_sub_link = f"https://de.sportmail.tk:2096/sssuuubbb/{expected_sub_id}"

    client = build_xui_client(SERVER)

    # get_client_by_email returns obj dict with nested "client" key
    data = await client.get_client_by_email(email)
    assert data, f"Client {email} not found"

    client_info = data.get("client", {})
    assert client_info.get("email") == email

    sub_id = client_info.get("subId", "")
    assert sub_id == expected_sub_id, f"Expected subId {expected_sub_id}, got {sub_id}"

    sub_link = await client.build_subscription_link(sub_id)
    assert sub_link, "Subscription link is empty"

    parsed = urlparse(sub_link)
    assert parsed.scheme == "https"
    assert parsed.hostname == "de.sportmail.tk"
    assert parsed.port == 2096

    assert sub_link == expected_sub_link, (
        f"Subscription link mismatch\n"
        f"  Expected: {expected_sub_link}\n"
        f"  Got:      {sub_link}\n"
        f"\nThe path should be /sssuuubbb/ not /sub/."
        f" Check that the panel's subPath setting is being fetched correctly."
    )
