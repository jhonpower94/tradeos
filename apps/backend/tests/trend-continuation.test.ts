import { describe, it, expect } from 'vitest';
import { Decision, Timeframe } from '@trading-os/shared';
import type { Candle, IndicatorSnapshot } from '@trading-os/shared';
import {
  TREND_CONTINUATION_ADX_MIN,
  trendContinuationStrategy,
} from '../src/modules/strategies/builtin/trend-continuation.js';

function candle(partial: Partial<Candle> & Pick<Candle, 'open' | 'high' | 'low' | 'close'>): Candle {
  return {
    openTime: 0,
    volume: 1_000,
    closeTime: 59_999,
    ...partial,
  };
}

function bullIndicators(opts: {
  ema21: number;
  adx: number;
  adxPrev?: number;
  atr?: number;
}): IndicatorSnapshot {
  const { ema21, adx, adxPrev = adx - 1, atr = 2 } = opts;
  // Fully bullish stack around ema21
  const ema9 = ema21 + 1;
  const ema50 = ema21 - 2;
  const ema200 = ema21 - 5;
  return {
    ema9: [ema9],
    ema21: [ema21],
    ema50: [ema50],
    ema200: [ema200],
    atr14: [atr],
    adx14: { adx: [adxPrev, adx], plusDI: [20, 30], minusDI: [10, 10] },
  };
}

function bearIndicators(opts: {
  ema21: number;
  adx: number;
  adxPrev?: number;
  atr?: number;
}): IndicatorSnapshot {
  const { ema21, adx, adxPrev = adx - 1, atr = 2 } = opts;
  const ema9 = ema21 - 1;
  const ema50 = ema21 + 2;
  const ema200 = ema21 + 5;
  return {
    ema9: [ema9],
    ema21: [ema21],
    ema50: [ema50],
    ema200: [ema200],
    atr14: [atr],
    adx14: { adx: [adxPrev, adx], plusDI: [10, 10], minusDI: [20, 30] },
  };
}

function evalTc(candles: Candle[], indicators: IndicatorSnapshot) {
  return trendContinuationStrategy.evaluate({
    symbol: 'TESTUSDT',
    timeframe: Timeframe.H1,
    candles,
    indicators,
    patterns: [],
  });
}

describe('trend_continuation tighten', () => {
  const ema21 = 100;

  it(`buys on EMA21 reclaim with ADX≥${TREND_CONTINUATION_ADX_MIN} rising`, () => {
    const last = candle({ open: 99.5, high: 101, low: 99.7, close: 100.8 });
    const r = evalTc([last], bullIndicators({ ema21, adx: 28 }));
    expect(r.decision).toBe(Decision.BUY);
    expect(r.confidence).toBeGreaterThan(0);
  });

  it('rejects ADX below regime-aligned minimum', () => {
    const last = candle({ open: 99.5, high: 101, low: 99.7, close: 100.8 });
    const r = evalTc([last], bullIndicators({ ema21, adx: 23 }));
    expect(r.decision).toBe(Decision.NO_TRADE);
  });

  it('rejects falling ADX even when stack is valid', () => {
    const last = candle({ open: 99.5, high: 101, low: 99.7, close: 100.8 });
    const r = evalTc([last], bullIndicators({ ema21, adx: 28, adxPrev: 32 }));
    expect(r.decision).toBe(Decision.NO_TRADE);
  });

  it('rejects EMA9-only proximity without EMA21 touch', () => {
    // low stays well above EMA21 — old rule would accept via EMA9*1.004
    const last = candle({ open: 102, high: 103.5, low: 101.8, close: 103 });
    const r = evalTc([last], bullIndicators({ ema21, adx: 30 }));
    expect(r.decision).toBe(Decision.NO_TRADE);
  });

  it('rejects overextended close above EMA21', () => {
    // atr=2 → max extension 2; close 103 is 3 above ema21
    const last = candle({ open: 101, high: 103.5, low: 99.8, close: 103 });
    const r = evalTc([last], bullIndicators({ ema21, adx: 30, atr: 2 }));
    expect(r.decision).toBe(Decision.NO_TRADE);
  });

  it('sells on EMA21 reclaim in bear stack', () => {
    const last = candle({ open: 100.5, high: 100.3, low: 99, close: 99.2 });
    const r = evalTc([last], bearIndicators({ ema21, adx: 27 }));
    expect(r.decision).toBe(Decision.SELL);
  });
});
