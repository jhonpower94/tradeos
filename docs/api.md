# API

Base path: `/api/v1`  
Auth: `Authorization: Bearer <jwt>` (except `/auth/*` and `/health`)

## Auth

- `POST /auth/register` `{ email, password }`
- `POST /auth/login` `{ email, password }`
- `GET /auth/me`

## Settings

- `GET/PATCH /settings`
- `PUT /settings/binance`
- `POST /settings/binance/test`

## Market

- `GET /market/symbols`
- `GET /market/ticker/:symbol`
- `GET /market/candles?symbol&interval&limit`
- `GET /market/orderbook/:symbol`

## Scanner / Signals / Trades / Positions / Portfolio / Journal / Analytics / Backtest / Notifications

See plan §4 and `apps/backend/src/routes/index.ts` for the full surface.

WebSocket: `WS /ws?token=<jwt>`  
Channels: `opportunities`, `positions`, `trades`, `notifications`, `scanner.status`
