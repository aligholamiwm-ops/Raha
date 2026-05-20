import asyncio
import json
import os
import sys
from app.integrations.xui_api import build_xui_client

async def test():
    # Load servers from environment variable
    servers_json = os.getenv('SERVERS')
    if not servers_json:
        print("SERVERS environment variable not found")
        return
        
    servers = json.loads(servers_json)
    if not servers:
        print("No servers found in SERVERS env")
        return

    server = servers[0]
    print(f"Testing server: {server['name']} at {server['ip']}")
    
    client = build_xui_client(server)
    
    try:
        print("Attempting login...")
        cookie = await client.login()
        print(f"Login successful, cookie: {cookie}")
        
        print("Fetching inbounds...")
        inbounds = await client.get_inbounds()
        print(f"Found {len(inbounds)} inbounds")
        
        if inbounds:
            inbound_id = inbounds[0]['id']
            print(f"Testing add_client on inbound {inbound_id}...")
            import uuid
            test_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
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
            
            if result.get("success"):
                print("SUCCESS: Config created via integrator!")
            else:
                print(f"FAILED: {result.get('msg')}")
        else:
            print("No inbounds found to test add_client")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # The container should already have the app in its path
    asyncio.run(test())
