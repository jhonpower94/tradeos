# Trading OS v1

Production-oriented Crypto Spot Trading Operating System for Binance Spot.

## Stack

- **Backend:** Node.js, TypeScript, Fastify, MongoDB, Mongoose, optional Redis
- **Frontend:** React, TypeScript, Vite, MUI, Lightweight Charts, React Query, Zustand
- **Auth:** JWT

## Quick start

```bash
# Install
corepack enable || true
npm install   # installs local pnpm + workspace deps via package.json scripts if needed
./node_modules/.bin/pnpm install

# Infra
docker compose up -d

# Env
cp .env.example .env

# Dev
./node_modules/.bin/pnpm --filter @trading-os/shared build
./node_modules/.bin/pnpm dev
```

- API: http://localhost:3001
- UI: http://localhost:5173
- Health: `GET /api/v1/health`

## Workspace

```
apps/backend   — Fastify API, engines, workers, Binance clients
apps/frontend  — Trading dashboard
packages/shared — Shared types, enums, Zod schemas
docs/          — Architecture, API, schemas, phases
```

## Modes

- **Paper** (default) — simulated fills
- **Live** — Binance signed orders (configure API keys in Settings)
- **Approval:** manual | semi | auto

## Documentation

See [`docs/architecture.md`](docs/architecture.md), [`docs/api.md`](docs/api.md), [`docs/schemas.md`](docs/schemas.md), [`docs/phases.md`](docs/phases.md).
