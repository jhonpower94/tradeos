# Production deploy (Docker Compose)

Single-host stack: MongoDB, Redis, Fastify API, nginx UI on ports **80** and **443**.

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
| `CORS_ORIGIN` | Browser origin, e.g. `https://aitradebot.pro` |
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
| `ui` | nginx SPA + `/api` + `/ws` proxy on host `:80` (ACME/redirect) and `:443` (TLS) |

## 3. Verify

```bash
# UI (HTTPS)
curl -fsSI https://aitradebot.pro/

# API via nginx
curl -fsS https://aitradebot.pro/api/v1/health

# HTTP should redirect to HTTPS
curl -fsSI http://aitradebot.pro/

# API container health
docker compose -f docker-compose.prod.yml ps
```

Open `https://YOUR_HOST/` in a browser, register/login, and configure paper or live mode in Settings.

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
- TLS is terminated in the `ui` nginx container (Let’s Encrypt). Issue certs **before** starting the TLS-enabled image (nginx will not start without the files).

## 5. TLS (Let’s Encrypt)

Prerequisites: DNS A/CNAME for the apex and `www` pointing at this host. Open **443/tcp** in UFW.

```bash
ufw allow 443/tcp
mkdir -p /var/www/certbot

# nginx must not bind :80 during the first issuance
docker compose -f docker-compose.prod.yml stop ui
certbot certonly --standalone --non-interactive --agree-tos \
  --register-unsafely-without-email \
  -d aitradebot.pro -d www.aitradebot.pro

docker compose -f docker-compose.prod.yml up -d --build
```

Set `CORS_ORIGIN=https://aitradebot.pro` in `.env.production` and recreate `api`.

Renewals use the HTTP-01 webroot (nginx keeps running):

```bash
certbot certonly --webroot -w /var/www/certbot --non-interactive --agree-tos \
  --deploy-hook 'docker exec tradeos-ui-1 nginx -s reload' \
  -d aitradebot.pro -d www.aitradebot.pro
```

Ubuntu’s `certbot.timer` handles the schedule. Persist the webroot + hook, for example in `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`:

```bash
#!/bin/sh
docker exec tradeos-ui-1 nginx -s reload
```

## Dev vs prod Compose

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local Mongo + Redis only (apps run via `pnpm dev`) |
| `docker-compose.prod.yml` | Full production stack |
