import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getCandles, bulkWrite, lean, limit, sort, find } = vi.hoisted(() => {
  const lean = vi.fn();
  const limit = vi.fn(() => ({ lean }));
  const sort = vi.fn(() => ({ limit }));
  const find = vi.fn(() => ({ sort }));
  return {
    getCandles: vi.fn(),
    bulkWrite: vi.fn(),
    lean,
    limit,
    sort,
    find,
  };
});

vi.mock('../src/modules/exchange/index.js', () => ({
  exchangeService: { getCandles },
}));

vi.mock('../src/models/Candle.js', () => ({
  CandleModel: { find, bulkWrite },
}));

import {
  intervalToMs,
  isCandleSeriesFresh,
  marketDataService,
} from '../src/modules/market-data/index.js';
import type { Candle } from '@trading-os/shared';

function bar(openTime: number, close = 100, intervalMs = 15 * 60_000): Candle {
  return {
    openTime,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closeTime: openTime + intervalMs - 1,
  };
}

describe('intervalToMs', () => {
  it('maps known intervals', () => {
    expect(intervalToMs('15m')).toBe(900_000);
    expect(intervalToMs('1h')).toBe(3_600_000);
  });
});

describe('isCandleSeriesFresh', () => {
  const ms = 15 * 60_000;

  it('is fresh when last bar is the current period', () => {
    const now = Date.parse('2026-08-31T12:07:00Z');
    const open = Math.floor(now / ms) * ms;
    expect(isCandleSeriesFresh([bar(open)], '15m', now)).toBe(true);
  });

  it('is fresh when last bar is the previous period', () => {
    const now = Date.parse('2026-08-31T12:07:00Z');
    const open = Math.floor(now / ms) * ms - ms;
    expect(isCandleSeriesFresh([bar(open)], '15m', now)).toBe(true);
  });

  it('is stale when last bar is older than one interval', () => {
    const now = Date.parse('2026-08-31T12:07:00Z');
    const open = Math.floor(now / ms) * ms - 2 * ms;
    expect(isCandleSeriesFresh([bar(open)], '15m', now)).toBe(false);
  });
});

describe('MarketDataService.getCandles', () => {
  beforeEach(() => {
    marketDataService.clearMemoryCache();
    getCandles.mockReset();
    bulkWrite.mockReset().mockResolvedValue(undefined);
    find.mockClear();
    sort.mockClear();
    limit.mockClear();
    lean.mockReset();
  });

  it('serves from DB when series is complete and fresh (no Binance call)', async () => {
    const now = Date.now();
    const ms = 15 * 60_000;
    const open = Math.floor(now / ms) * ms;
    const docs = Array.from({ length: 50 }, (_, i) => bar(open - (49 - i) * ms, 100 + i, ms));
    lean.mockResolvedValue([...docs].reverse());

    const out = await marketDataService.getCandles('btcusdt', '15m', 50);

    expect(getCandles).not.toHaveBeenCalled();
    expect(out).toHaveLength(50);
    expect(out[out.length - 1]!.openTime).toBe(open);
  });

  it('fetches Binance when DB is empty', async () => {
    lean.mockResolvedValue([]);
    const candles = [bar(1), bar(2)];
    getCandles.mockResolvedValue(candles);

    const out = await marketDataService.getCandles('ETHUSDT', '1h', 2);

    expect(getCandles).toHaveBeenCalledWith('ETHUSDT', '1h', 2);
    expect(out).toEqual(candles);
    expect(bulkWrite).toHaveBeenCalled();
  });

  it('falls back to stale DB when Binance fails', async () => {
    const docs = [bar(1_000), bar(2_000)];
    lean.mockResolvedValue([...docs].reverse());
    getCandles.mockRejectedValue(new Error('BINANCE_BANNED'));

    const out = await marketDataService.getCandles('BTCUSDT', '15m', 500);

    expect(out).toHaveLength(2);
    expect(out[0]!.openTime).toBe(1_000);
  });

  it('uses memory on second call without hitting DB/Binance again', async () => {
    lean.mockResolvedValue([]);
    const ms = 60_000;
    const candles = Array.from({ length: 10 }, (_, i) => {
      const open = Math.floor(Date.now() / ms) * ms - (9 - i) * ms;
      return bar(open, 100, ms);
    });
    getCandles.mockResolvedValue(candles);

    await marketDataService.getCandles('BTCUSDT', '1m', 10);
    find.mockClear();
    getCandles.mockClear();

    const out = await marketDataService.getCandles('BTCUSDT', '1m', 10);

    expect(out).toHaveLength(10);
    expect(find).not.toHaveBeenCalled();
    expect(getCandles).not.toHaveBeenCalled();
  });

  it('persists closed WS candles when asked', async () => {
    const c = bar(Date.now());
    marketDataService.updateCandle('btcUSDT', '15m', c, { persist: true });
    await vi.waitFor(() => expect(bulkWrite).toHaveBeenCalled());
  });
});
