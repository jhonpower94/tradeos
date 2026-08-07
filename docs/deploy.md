# Production deploy (Docker Compose)

Single-host stack: MongoDB, Redis, Fastify API, nginx UI on port **80**.

## Prerequisites

- Docker Engine + Docker Compose v2
- Outbound HTTPS to Binance (live trading / market data)
- A filled `.env.production` (never commit this file)

## 1. Configure secrets

```bash
cp .env.production.example .env.production
```

Generate required secrets:

```bash
# JWT_SECRET
openssl rand -base64 48

# ENCRYPTION_KEY (64 hex chars)
openssl rand -hex 32
```

Paste them into `.env.production`. Also set:

| Variable | Notes |
|----------|--------|
| `CORS_ORIGIN` | Browser origin, e.g. `http://YOUR_HOST` or `https://trading.example.com` |
| `BINANCE_*` | Defaults are mainnet; set `BINANCE_TESTNET=true` only for testnet |
| SMTP / Telegram / Discord | Optional notifications |

Weak or missing `JWT_SECRET` / `ENCRYPTION_KEY` will cause the API to **refuse to start** in production.

## 2. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Services:

| Service | Role |
|---------|------|
| `mongo` | MongoDB 7 (internal only) |
| `redis` | Redis 7 (internal only) |
| `api` | Backend on `:3001` (not published; reached via nginx) |
| `ui` | nginx SPA + `/api` + `/ws` proxy on host `:80` |

## 3. Verify

```bash
# UI
curl -fsS http://localhost/

# API via nginx
curl -fsS http://localhost/api/v1/health

# API container health
docker compose -f docker-compose.prod.yml ps
```

Open `http://YOUR_HOST/` in a browser, register/login, and configure paper or live mode in Settings.

## 4. Common operations

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f ui

# Rebuild after code changes
docker compose -f docker-compose.prod.yml up -d --build

# Stop
docker compose -f docker-compose.prod.yml down

# Stop and wipe DB volumes (destructive)
docker compose -f docker-compose.prod.yml down -v
```

## Architecture notes

- The SPA talks to **relative** `/api/v1` and `/ws` (same origin as the UI).
- nginx proxies those paths to the `api` service; Vite’s dev proxy is not used in production.
- Mongo and Redis ports are **not** published on the host.
- For TLS, put a reverse proxy (Caddy, Traefik, or cloud LB) in front of port 80, or extend the `ui` service with certificates.

## Dev vs prod Compose

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local Mongo + Redis only (apps run via `pnpm dev`) |
| `docker-compose.prod.yml` | Full production stack |
