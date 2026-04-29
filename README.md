# Raha VPN Backend

> Production-ready FastAPI backend for a **Telegram Mini App** VPN management system.  
> Manages users, VPN configurations (via 3x-ui panel), crypto payments (Plisio), support tickets, and a referral programme.

---

## Features

- 🔐 **Telegram Mini App auth** — HMAC-SHA256 init-data validation
- 🖥️ **3x-ui panel integration** — async client with auto-retry on 401
- 💰 **Wallet system** — top-up via Plisio crypto invoices
- 🎁 **Free trial** — 200 MB config for every new user
- 👥 **Referral programme** — tiered discounts based on referred GB
- 🎟️ **Discount codes** — one-time or reusable codes
- 🗂️ **Support tickets** — user/admin threaded messaging
- ⚙️ **Celery workers** — async payment processing & config sync
- 🐳 **Docker Compose** — one-command deployment
- 📊 **Admin dashboard** — stats, config sync, user management

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
git clone https://github.com/your-org/raha.git
cd raha
cp .env.example .env
# Edit .env — fill in BOT_TOKEN, PLISIO_*, SECRET_KEY
```

### 2. Run with Docker Compose

```bash
docker compose up -d
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SECRET_KEY` | ✅ | — | Random secret for internal signing |
| `BOT_TOKEN` | ✅ | — | Telegram bot token |
| `MONGODB_URL` | ✅ | `mongodb://localhost:27017` | MongoDB connection string |
| `MONGODB_DB_NAME` | | `raha_vpn` | MongoDB database name |
| `REDIS_URL` | | `redis://localhost:6379/0` | Redis URL (Celery broker) |
| `PLISIO_API_KEY` | ✅ | — | Plisio API key |
| `PLISIO_SECRET_KEY` | ✅ | — | Plisio secret key (webhook verification) |
| `RATE_LIMIT_PER_MINUTE` | | `60` | Per-IP rate limit |

---

## API Endpoints Overview

### Authentication
All endpoints (except `/health` and `/api/v1/plans/`) require a Telegram Mini App
`init_data` string passed as the `init-data` HTTP header.

### Users — `/api/v1/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | User | Current user profile |
| PUT | `/me` | User | Update own profile |
| GET | `/` | Admin | List all users |
| GET | `/{telegram_id}` | Admin | Get user by ID |
| POST | `/{telegram_id}/add_balance` | Admin | Add wallet balance |

### VPN Configs — `/api/v1/configs`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/my` | User | User's configs |
| POST | `/purchase` | User | Buy a config (plan + ISP) |
| GET | `/{uuid}/vless` | User | VLESS URI with clean IP |
| POST | `/{uuid}/renew` | User | Renew config |
| GET | `/` | Admin | All configs |
| DELETE | `/{uuid}` | Admin | Delete config |

### Plans — `/api/v1/plans`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Public | List all plans |
| POST | `/` | Admin | Create plan |
| PUT | `/{plan_name}` | Admin | Update plan |
| DELETE | `/{plan_name}` | Admin | Delete plan |

### Payments — `/api/v1/payments`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/create-invoice` | User | Create Plisio invoice |
| POST | `/webhook` | Plisio | IPN callback |

### Admin — `/api/v1/admin`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/stats` | Admin | Dashboard statistics |
| POST | `/sync-configs` | Admin | Sync all XUI panel configs |

Full interactive documentation available at `/docs` (Swagger UI) and `/redoc`.

---

## Referral Tiers

| Referred GB purchased | Bonus discount |
|---|---|
| 0 – 10 GB | 0% |
| 10 – 50 GB | 5% |
| 50 – 100 GB | 10% |
| 100 GB+ | 15% |

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "feat: add my feature"`
4. Push and open a Pull Request

Please follow existing code style (Pydantic v2, async Motor, type hints throughout).

---

## License

[MIT](LICENSE)
