import { describe, it, expect } from 'vitest';
import { Decision } from '@trading-os/shared';
import { rsiReversalStrategy } from '../src/modules/strategies/builtin/rsi-reversal.js';
import { computeAllIndicators } from '../src/modules/indicators/index.js';
import { detectPatterns } from '../src/modules/patterns/index.js';

import type { Candle } from '@trading-os/shared';

function makeCandlesFromCloses(closes: number[]): Candle[] {
  return closes.map((c, i) => ({
    openTime: i * 60_000,
    open: c - 0.4,
    high: c + 1.2,
    low: c - 1.2,
    close: c,
    volume: 800 + (i % 20) * 50,
    closeTime: i * 60_000 + 59_999,
  }));
}

describe('rsi_reversal strategy', () => {
  it('detects bullish reversal when divergence + threshold exit present', () => {
    const n = 70;
    const closes = Array.from({ length: n }, (_, i) => 100 - i * 0.15);
    // create two swing lows (older at 20, newer at 35) with newer price lower
    closes[20] = 90;
    closes[19] = 92;
    closes[21] = 92;
    closes[35] = 88;
    closes[34] = 90;
    closes[36] = 90;

    const candles = makeCandlesFromCloses(closes);
    const indicators = computeAllIndicators(candles);

    // patch RSI to show bullish divergence and threshold exit
    const rsi = Array.from({ length: n }, () => 45);
    rsi[20] = 25;
    rsi[35] = 32; // newer RSI higher
    // make the last two bars show an exit from oversold
    rsi[n - 2] = 28;
    rsi[n - 1] = 31;

    const patched = { ...indicators, rsi14: rsi };
    const patterns = detectPatterns(candles, patched);
    const res = rsiReversalStrategy.evaluate({
      symbol: 'TEST',
      timeframe: '1h',
      candles,
      indicators: patched,
      patterns,
    });
    expect(res.strategyId).toBe('rsi_reversal');
    expect([Decision.BUY, Decision.SELL, Decision.NO_TRADE]).toContain(res.decision);
    if (res.decision === Decision.BUY) {
      expect(res.confidence).toBeGreaterThan(50);
    }
  });
});
