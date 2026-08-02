# MongoDB Schemas

Collections: `users`, `settings`, `candles`, `signals`, `trades`, `positions`, `journalentries`, `strategydefs`, `analyticssnapshots`, `notifications`, `backtestruns`

Key indexes:

- candles: unique `(symbol, interval, openTime)`
- signals: `(userId, status, confidence)`
- positions/trades: `(userId, status)`

Settings stores encrypted Binance keys in `binance.apiKeyEnc` / `apiSecretEnc`.
