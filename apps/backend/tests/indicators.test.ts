import { describe, it, expect } from 'vitest';
import { ema, sma, rsi, macd, computeAllIndicators } from '../src/modules/indicators/index.js';
import type { Candle } from '@trading-os/shared';

function makeCandles(n: number): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price += Math.sin(i / 5) * 2 + 0.1;
    out.push({
      openTime: i * 60_000,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000 + i,
      closeTime: i * 60_000 + 59_999,
    });
  }
  return out;
}

describe('indicators', () => {
  it('computes SMA', () => {
    const v = [1, 2, 3, 4, 5];
    const s = sma(v, 3);
    expect(s[2]).toBeCloseTo(2);
    expect(s[4]).toBeCloseTo(4);
  });

  it('computes EMA length', () => {
    const v = Array.from({ length: 50 }, (_, i) => i + 1);
    const e = ema(v, 10);
    expect(e[9]).not.toBeNull();
    expect(e[49]).toBeGreaterThan(e[9]!);
  });

  it('computes RSI bounds', () => {
    const candles = makeCandles(100);
    const r = rsi(candles.map((c) => c.close), 14);
    const last = r[r.length - 1]!;
    expect(last).toBeGreaterThanOrEqual(0);
    expect(last).toBeLessThanOrEqual(100);
  });

  it('computes MACD', () => {
    const v = makeCandles(100).map((c) => c.close);
    const m = macd(v);
    expect(m.macd.length).toBe(v.length);
  });

  it('computeAllIndicators returns snapshot', () => {
    const snap = computeAllIndicators(makeCandles(250));
    expect(snap.ema21?.length).toBe(250);
    expect(snap.rsi14).toBeDefined();
    expect(snap.bollinger).toBeDefined();
    expect(snap.pivots).toBeDefined();
  });
});
