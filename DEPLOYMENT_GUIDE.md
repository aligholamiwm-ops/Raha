# Raha VPN Backend — Deployment Guide

Step-by-step guide for deploying Raha on a fresh **Ubuntu 22.04 LTS** server.

---

## 1. System Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2+ vCPUs |
| RAM | 1 GB | 2 GB |
| Disk | 20 GB | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

---

## 2. Initial Server Setup

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install utilities
sudo apt install -y curl wget git build-essential software-properties-common \
    ca-certificates gnupg lsb-release ufw

# Configure firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 3. Install Python 3.11

```bash
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip

# Verify
python3.11 --version
```

---

## 4. Install MongoDB 7.0

```bash
# Import MongoDB GPG key
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
    sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add repository
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org

# Enable and start
sudo systemctl enable mongod
sudo systemctl start mongod

# Verify
mongosh --eval "db.adminCommand({ ping: 1 })"
```

---

## 5. Install Redis

```bash
sudo apt install -y redis-server

# Configure Redis to use systemd supervision
sudo sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf

sudo systemctl enable redis-server
sudo systemctl restart redis-server

# Verify
redis-cli ping   # → PONG
```

---

## 6. Clone and Set Up the Application

```bash
# Create a dedicated user (optional but recommended)
sudo useradd -m -s /bin/bash raha
sudo su - raha

# Clone
git clone https://github.com/your-org/raha.git
cd raha

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 7. Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Fill in **all** values:

```dotenv
APP_ENV=production
SECRET_KEY=<generate with: python3 -c "import secrets; print(secrets.token_hex(32))">
BOT_TOKEN=<your Telegram bot token>
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB_NAME=raha_vpn
REDIS_URL=redis://localhost:6379/0
PLISIO_SECRET_KEY=<from Plisio dashboard>
PLISIO_API_KEY=<from Plisio dashboard>
RATE_LIMIT_PER_MINUTE=60
```

---

## 8. Run with Systemd

### 8a. FastAPI (Uvicorn) service

```bash
sudo nano /etc/systemd/system/raha-api.service
```

```ini
[Unit]
Description=Raha VPN FastAPI Backend
After=network.target mongod.service redis-server.service
Wants=mongod.service redis-server.service

[Service]
Type=simple
User=raha
WorkingDirectory=/home/raha/raha
EnvironmentFile=/home/raha/raha/.env
ExecStart=/home/raha/raha/.venv/bin/uvicorn app.main:app \
    --host 0.0.0.0 --port 8000 --workers 2 --log-level info
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 8b. Celery worker service

```bash
sudo nano /etc/systemd/system/raha-worker.service
```

```ini
[Unit]
Description=Raha VPN Celery Worker
After=network.target redis-server.service mongod.service

[Service]
Type=simple
User=raha
WorkingDirectory=/home/raha/raha
EnvironmentFile=/home/raha/raha/.env
ExecStart=/home/raha/raha/.venv/bin/celery \
    -A app.celery_worker.celery_app worker \
    --loglevel=info --concurrency=4
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 8c. Celery beat (scheduler) service

```bash
sudo nano /etc/systemd/system/raha-beat.service
```

```ini
[Unit]
Description=Raha VPN Celery Beat Scheduler
After=network.target redis-server.service

[Service]
Type=simple
User=raha
WorkingDirectory=/home/raha/raha
EnvironmentFile=/home/raha/raha/.env
ExecStart=/home/raha/raha/.venv/bin/celery \
    -A app.celery_worker.celery_app beat \
    --loglevel=info
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Enable and start all services

```bash
sudo systemctl daemon-reload
sudo systemctl enable raha-api raha-worker raha-beat
sudo systemctl start raha-api raha-worker raha-beat

# Check status
sudo systemctl status raha-api
sudo systemctl status raha-worker
```

---

## 9. Run with Docker Compose (Alternative)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin

# In the project directory (with .env configured):
docker compose up -d

# View logs
docker compose logs -f app
docker compose logs -f worker
```

---

## 10. SSL/TLS with Nginx and Let's Encrypt

### Install Nginx and Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Nginx configuration

```bash
sudo nano /etc/nginx/sites-available/raha
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/raha /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Obtain SSL certificate

```bash
sudo certbot --nginx -d api.yourdomain.com
# Follow the prompts; Certbot will auto-configure HTTPS redirect.

# Auto-renewal (runs twice daily via systemd timer — already active after certbot install)
sudo systemctl status certbot.timer
```

---

## 11. Monitoring and Logs

### View service logs

```bash
# FastAPI
sudo journalctl -u raha-api -f

# Celery worker
sudo journalctl -u raha-worker -f

# MongoDB
sudo journalctl -u mongod -f
```

### Check application health

```bash
curl http://localhost:8000/health
# → {"status":"ok","service":"Raha VPN Backend"}
```

### MongoDB quick inspection

```bash
mongosh raha_vpn
db.users.countDocuments()
db.vpn_configs.countDocuments({status: "active"})
```

### Redis queue inspection

```bash
redis-cli
KEYS *
```

---

## 12. Updating the Application

```bash
cd /home/raha/raha
git pull origin main
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart raha-api raha-worker raha-beat
```

---

## 13. Creating the First Admin User

After the first user logs in via the Mini App, grant admin role directly in MongoDB:

```bash
mongosh raha_vpn
db.users.updateOne(
  { telegram_id: <YOUR_TELEGRAM_ID> },
  { $set: { role: "admin" } }
)
```
