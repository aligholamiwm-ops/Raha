import requests
import json
import urllib3
from datetime import datetime
import time

# Disable SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class XUIClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip('/')
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'X-Requested-With': 'XMLHttpRequest'
        })

    @staticmethod
    def timestamp_to_date(ts_ms):
        if not ts_ms or ts_ms <= 0:
            return "Unlimited"
        try:
            dt = datetime.fromtimestamp(ts_ms / 1000.0)
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        except Exception:
            return "Invalid Date"

    @staticmethod
    def date_to_timestamp(date_str):
        if not date_str:
            return 0
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            return int(time.mktime(dt.timetuple()) * 1000)
        except Exception:
            return 0

    @staticmethod
    def format_bytes(size):
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size < 1024.0:
                return f"{size:.2f} {unit}"
            size /= 1024.0
        return f"{size:.2f} PB"

    def login(self):
        """Logs in and stores the session cookie."""
        login_url = f"{self.base_url}/login"
        payload = {'username': self.username, 'password': self.password}
        try:
            response = self.session.post(login_url, data=payload, verify=False)
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    print("Login successful!")
                    return True
                else:
                    print(f"Login failed: {data.get('msg')}")
            else:
                print(f"Login failed with status code: {response.status_code}")
        except Exception as e:
            print(f"An error occurred during login: {e}")
        return False

    def regenerate_cookie(self):
        """
        Clears current cookies and re-logs in to get a fresh session cookie.
        """
        print("Regenerating session cookie...")
        self.session.cookies.clear()
        return self.login()

    def get_inbounds(self):
        url = f"{self.base_url}/panel/api/inbounds/list"
        try:
            response = self.session.get(url, verify=False)
            if response.status_code == 200:
                data = response.json()
                return data.get('obj', []) if data.get('success') else []
        except Exception as e:
            print(f"Error fetching inbounds: {e}")
        return []

    def get_client_info(self, email=None):
        inbounds = self.get_inbounds()
        client_list = []
        for ib in inbounds:
            stream_settings = json.loads(ib.get('streamSettings', '{}'))
            domain_name = "N/A"
            tls_settings = stream_settings.get('tlsSettings') or stream_settings.get('xtlsSettings') or stream_settings.get('realitySettings')
            if tls_settings:
                domain_name = tls_settings.get('serverName', 'N/A')

            client_stats = {stat['email']: stat for stat in ib.get('clientStats', [])}
            settings = json.loads(ib.get('settings', '{}'))
            clients = settings.get('clients', [])

            for c in clients:
                c_email = c.get('email')
                if email and c_email != email:
                    continue
                stats = client_stats.get(c_email, {})
                up = stats.get('up', 0)
                down = stats.get('down', 0)
                total_usage = up + down

                info = {
                    "Email": c_email,
                    "ID": c.get('id'),
                    "Status": "Enabled" if c.get('enable') else "Disabled",
                    "Usage": self.format_bytes(total_usage),
                    "Created": self.timestamp_to_date(c.get('created_at')),
                    "Last Online": self.timestamp_to_date(stats.get('expiryTime')) if stats.get('expiryTime') else "Never",
                    "Domain Name": domain_name,
                    "Inbound ID": ib.get('id'),
                    "Protocol": ib.get('protocol')
                }
                client_list.append(info)
        return client_list

