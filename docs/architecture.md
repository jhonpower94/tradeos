# Architecture

Trading OS is a monorepo with a single Fastify process owning REST, app WebSocket, scanner worker, and position monitor.

## Pipeline

Live market data → Scanner → Indicators → Patterns → Strategies → Consensus → Ranking → Risk → Trade signal → Execution (optional) → Position monitor → Journal → Analytics

## Modules

| Module | Role |
|---|---|
| Exchange | Binance REST/WS facade, rate limits, reconnect |
| Market Data | Candle cache (memory + optional Mongo) |
| Indicators | Pure technical indicators |
| Patterns | Price action / structure detectors |
| Strategies | 18 built-in strategies (no plugins) |
| Consensus | Weighted confidence + regime (receives RegimeResult) |
| Regime | Pre-strategy market classification; filters strategy set |
| Ranking | Sort/persist opportunities |
| Risk | Sizing + safety gates |
| Trade | Paper/live execution + approval modes |
| Position | MTM, trailing, exits |
| Journal / Analytics / Notifications / Backtest | Post-trade & research |

## Trust

- API keys encrypted AES-256-GCM
- Risk engine is the only gate before orders
- Live requires `trading.mode=live` + configured keys
