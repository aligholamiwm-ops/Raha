# Raha VPN — Telegram Mini App VPN Manager

Raha is a modern, high-performance VPN management system built for Telegram Mini Apps. It integrates with 3x-ui panels to provide seamless VLESS config management, automated payments (Plisio), support tickets, and a referral programme.

---

## Features
- 🔐 **Telegram Mini App auth** — HMAC-SHA256 init-data validation
- 🖥️ **3x-ui panel integration** — async client with auto-retry on 401
- 🛡️ **Advanced Admin UI** — Integrated management panel for servers, users, plans, and discounts
- 💰 **Wallet system** — top-up via Plisio crypto invoices
- 🎁 **Free trial** — 200 MB config for every new user
- 👥 **Referral programme** — tiered discounts based on referred GB
- 🎟️ **Discount codes** — one-time or reusable codes
- 🗂️ **Support tickets** — user/admin threaded messaging
- ⚙️ **Celery workers** — async payment processing & config sync
- 🐳 **Docker Compose** — one-command deployment

---

## Architecture
```
┌──────────────────────────────────────────────────────────────┐
│                      Telegram Mini App                       │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTPS (init_data header)
┌─────────────────────────▼────────────────────────────────────┐
│                   FastAPI (Uvicorn)                          │
│  /api/v1/users  /configs  /plans  /payments  /admin  …       │
│                                                              │
│  Dependencies: Telegram HMAC auth · SlowAPI rate limiting    │
└──────┬────────────────────┬───────────────────┬─────────────┘
       │                    │                   │
┌──────▼──────┐  ┌──────────▼──────┐  ┌────────▼────────┐
│  MongoDB     │  │  3x-ui Panel(s) │  │  Plisio API     │
│  (Motor)     │  │  (AsyncXUIClient│  │  (crypto pay)   │
└─────────────┘  └─────────────────┘  └─────────────────┘
       │
┌──────▼──────┐
│  Redis       │◄─── Celery Beat (scheduler)
│  (broker)    │◄─── Celery Worker (payment processing, config sync)
└─────────────┘
```

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- A Telegram Bot token (`@BotFather`)
- A 3x-ui panel instance
- A Plisio account

### 1. Clone & configure
```bash
git clone https://github.com/aligholamiwm-ops/Raha.git
cd Raha
cp .env.example .env
# Edit .env — fill in BOT_TOKEN, PLISIO_*, SECRET_KEY
```

### 2. Run with Docker Compose
```bash
docker compose up -d --build
```
The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

## Admin Panel
The project now includes a built-in **Admin UI** accessible directly within the Telegram Mini App for users with the `admin` role.

### Key Admin Capabilities:
- **Dashboard**: View real-time stats on users, revenue, and active configs.
- **Server Management**: Add and configure 3x-ui panels and define Clean IPs per ISP.
- **User Management**: Search users, manually adjust wallet balances, and change user roles.
- **Pricing & Marketing**: Create/Update subscription plans and discount codes.

To promote a user to admin, you can manually update their role in MongoDB:
```bash
docker exec raha_mongodb mongosh raha_vpn --eval 'db.users.updateOne({telegram_id: YOUR_ID}, {$set: {role: "admin"}})'
```

---

## Environment Variables
| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | ✅ | — | Random secret for internal signing |
| `BOT_TOKEN` | ✅ | — | Telegram bot token |
| `MONGODB_URL` | ✅ | `mongodb://mongodb:27017` | MongoDB connection string |
| `MONGODB_DB_NAME` | | `raha_vpn` | MongoDB database name |
| `REDIS_URL` | | `redis://redis:6379/0` | Redis URL (Celery broker) |
| `PLISIO_API_KEY` | ✅ | — | Plisio API key |
| `PLISIO_SECRET_KEY` | ✅ | — | Plisio secret key (webhook verification) |
| `MINI_APP_URL` | ✅ | — | The public URL where your Mini App is hosted |

---

## API Endpoints Overview

### Authentication
All endpoints (except `/health` and `/api/v1/plans/`) require a Telegram Mini App `init_data` string passed as the `init-data` HTTP header.

### Admin — `/api/v1/admin`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stats` | Admin | Dashboard statistics |
| PUT | `/users/{id}/role` | Admin | Change user role |
| POST | `/sync-configs` | Admin | Sync all XUI panel configs |

### Users — `/api/v1/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | User | Current user profile |
| GET | `/` | Admin | List all users |
| POST | `/{id}/add_balance` | Admin | Add wallet balance |

---

## License
[MIT](LICENSE)
