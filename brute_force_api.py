import httpx
import json
import asyncio

async def test_endpoint():
    base_url = "https://us-84.eseminar.cf:2083"
    username = "jetset"
    password = "jetset"
    
    prefixes = ["", "/xui"]
    endpoints = [
        "/panel/api/inbounds/addClient",
        "/xui/API/panel/api/inbounds/addClient",
        "/panel/API/panel/api/inbounds/addClient",
        "/xui/panel/api/inbounds/addClient",
    ]
    
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest",
    }
    
    async with httpx.AsyncClient(verify=False, timeout=10) as client:
        # 1. Login to get cookie
        cookie = ""
        for prefix in prefixes:
            login_url = f"{base_url}{prefix}/login"
            print(f"Trying login at {login_url}...")
            try:
                resp = await client.post(login_url, data={"username": username, "password": password})
                if resp.status_code == 200 and resp.json().get("success"):
                    cookie = resp.headers.get("set-cookie", "").split(";")[0]
                    print(f"Login successful with prefix '{prefix}', cookie: {cookie}")
                    break
            except Exception as e:
                print(f"Login failed at {login_url}: {e}")
        
        if not cookie:
            print("Could not login anywhere.")
            return

        # 2. Try endpoints
        client.headers["Cookie"] = cookie
        payload = {
            "id": 1,
            "settings": json.dumps({
                "clients": [{
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "email": "12345-brutetest",
                    "enable": True,
                    "totalGB": 0,
                    "expiryTime": 0,
                }]
            })
        }
        
        for ep in endpoints:
            url = f"{base_url}{ep}"
            print(f"Testing endpoint: {url}")
            try:
                resp = await client.post(url, json=payload)
                print(f"Result: {resp.status_code}, Body: {resp.text[:100]}")
                if resp.status_code == 200:
                    print(f"!!! FOUND WORKING ENDPOINT: {url}")
            except Exception as e:
                print(f"Error at {url}: {e}")

if __name__ == "__main__":
    asyncio.run(test_endpoint())
