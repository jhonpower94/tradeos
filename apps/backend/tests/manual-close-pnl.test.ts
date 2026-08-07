import { describe, it, expect, vi, afterEach } from 'vitest';
import { Side } from '@trading-os/shared';
import {
  calcNetPnl,
  estimateExitFee,
  resolveLiveExitPrice,
} from '../src/modules/trade/pricing.js';
import { exchangeService } from '../src/modules/exchange/index.js';
import { getTickerPrice, setTickerPrice } from '../src/modules/market-data/index.js';

describe('resolveLiveExitPrice', () => {
  const originalGetTicker = exchangeService.getTicker.bind(exchangeService);

  afterEach(() => {
    exchangeService.getTicker = originalGetTicker;
  });

  it('prefers REST ticker over stale cache', async () => {
    setTickerPrice('BTCUSDT', 90_000);
    exchangeService.getTicker = vi.fn(async () => ({
      symbol: 'BTCUSDT',
      price: 100_000,
      bid: 99_999,
      ask: 100_001,
      volume24h: 1e9,
    }));

    const price = await resolveLiveExitPrice('BTCUSDT');
    expect(price).toBe(100_000);
    expect(getTickerPrice('BTCUSDT')).toBe(100_000);
  });

  it('falls back to WS cache when REST fails', async () => {
    setTickerPrice('ETHUSDT', 3_500);
    exchangeService.getTicker = vi.fn(async () => {
      throw new Error('network down');
    });

    const price = await resolveLiveExitPrice('ETHUSDT');
    expect(price).toBe(3_500);
  });

  it('returns undefined when REST and cache are unavailable (no stale currentPrice)', async () => {
    exchangeService.getTicker = vi.fn(async () => {
      throw new Error('network down');
    });
    const price = await resolveLiveExitPrice('NOSUCHUSDT');
    expect(price).toBeUndefined();
  });
});

describe('manual close PnL vs stale mark', () => {
  it('realized PnL uses live exit, not stale currentPrice', () => {
    const entry = 100;
    const staleCurrent = 101;
    const liveExit = 110;
    const qty = 2;
    const feeRate = 0.001;

    const stalePnl = calcNetPnl(Side.BUY, entry, staleCurrent, qty, feeRate);
    const livePnl = calcNetPnl(Side.BUY, entry, liveExit, qty, feeRate);

    expect(livePnl).toBeCloseTo(20 - estimateExitFee(liveExit, qty, feeRate), 8);
    expect(livePnl).toBeGreaterThan(stalePnl);
    expect(liveExit).not.toBe(staleCurrent);
  });
});
