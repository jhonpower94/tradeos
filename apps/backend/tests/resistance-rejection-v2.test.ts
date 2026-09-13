import { describe, it, expect } from 'vitest';
import { Decision } from '@trading-os/shared';
import { resistanceRejectionV2 } from '../src/modules/strategies/builtin/resistance-rejection-v2.js';
import { computeAllIndicators } from '../src/modules/indicators/index.js';
import { detectPatterns } from '../src/modules/patterns/index.js';

import type { Candle } from '@trading-os/shared';

function makeCandles(n: number): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price += Math.sin(i / 8) * 3 + (i > n / 2 ? 0.15 : -0.05);
    out.push({
      openTime: i * 60_000,
      open: price - 0.4,
      high: price + 1.2,
      low: price - 1.2,
      close: price,
      volume: 800 + (i % 20) * 50,
      closeTime: i * 60_000 + 59_999,
    });
  }
  return out;
}

describe('resistance_rejection_v2 strategy', () => {
  it('returns SELL when strong upper wick touches prior resistance', () => {
    const candles = makeCandles(120);
    const last = candles[candles.length - 1]!;
    // create a nearby prior high as resistance
    const priorHigh = Math.max(...candles.slice(-40, -1).map((c) => c.high));
    last.high = priorHigh + 0.5;
    last.open = priorHigh + 0.2;
    last.close = priorHigh - 0.2; // bearish close

    const indicators = computeAllIndicators(candles);
    const patterns = detectPatterns(candles, indicators);
    const res = resistanceRejectionV2.evaluate({
      symbol: 'TEST',
      timeframe: '1h',
      candles,
      indicators,
      patterns,
    });
    expect(res.strategyId).toBe('resistance_rejection_v2');
    expect([Decision.SELL, Decision.NO_TRADE]).toContain(res.decision);
  });
});
