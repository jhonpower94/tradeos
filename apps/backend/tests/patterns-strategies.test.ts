import { describe, it, expect } from 'vitest';
import { detectPatterns, findSwingPoints } from '../src/modules/patterns/index.js';
import { computeAllIndicators } from '../src/modules/indicators/index.js';
import { runAllStrategies } from '../src/modules/strategies/index.js';
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

describe('patterns', () => {
  it('finds swings and patterns', () => {
    const candles = makeCandles(120);
    const swings = findSwingPoints(candles);
    expect(swings.length).toBeGreaterThan(0);
    const indicators = computeAllIndicators(candles);
    const patterns = detectPatterns(candles, indicators);
    expect(Array.isArray(patterns)).toBe(true);
  });
});

describe('strategies', () => {
  it('runs all strategies without throwing', () => {
    const candles = makeCandles(250);
    const indicators = computeAllIndicators(candles);
    const patterns = detectPatterns(candles, indicators);
    const results = runAllStrategies({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      candles,
      indicators,
      patterns,
    });
    expect(results.length).toBe(22);
    expect(results.every((r) => r.confidence >= 0 && r.confidence <= 100)).toBe(true);
  });
});
