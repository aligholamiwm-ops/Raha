import asyncio
import json
import os
import sys
import logging

# Enable logging
logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.DEBUG)

from app.integrations.xui_api import build_xui_client

async def test():
    servers_json = os.getenv('SERVERS')
    if not servers_json:
        print("SERVERS environment variable not found")
        return
        
    servers = json.loads(servers_json)
    server = servers[0]
    print(f"Testing server: {server['name']} at {server['ip']}")
    
    client = build_xui_client(server)
    
    try:
        print("\n--- Step 1: Login ---")
        cookie = await client.login()
        print(f"Login successful")
        
        print("\n--- Step 2: Get Inbounds ---")
        inbounds = await client.get_inbounds()
        print(f"Found {len(inbounds)} inbounds")
        
        if inbounds:
            inbound_id = inbounds[0]['id']
            print(f"\n--- Step 3: Add Client ---")
            import uuid
            test_email = f"debug_{uuid.uuid4().hex[:8]}@example.com"
            test_uuid = str(uuid.uuid4())
            client_data = {
                "id": test_uuid,
                "alterId": 0,
                "email": test_email,
                "limitIp": 0,
                "totalGB": 0,
                "expiryTime": 0,
                "enable": True,
                "tgId": "",
                "subId": ""
            }
            result = await client.add_client(inbound_id, client_data)
            print(f"Add client result: {json.dumps(result, indent=2)}")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    asyncio.run(test())
