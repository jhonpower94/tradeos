import { describe, it, expect } from 'vitest';
import { Decision, STRATEGY_IDS, Timeframe } from '@trading-os/shared';
import {
  detectRsiDivergence,
  rsiDivergenceStrategy,
} from '../src/modules/strategies/builtin/rsi-divergence.js';
import { donchianVolumeStrategy } from '../src/modules/strategies/builtin/donchian-volume.js';
import { adxIgnitionStrategy } from '../src/modules/strategies/builtin/adx-ignition.js';
import { computeAllIndicators } from '../src/modules/indicators/index.js';
import { runAllStrategies } from '../src/modules/strategies/index.js';
import { detectPatterns } from '../src/modules/patterns/index.js';
import type { Candle, IndicatorSnapshot } from '@trading-os/shared';

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

describe('detectRsiDivergence', () => {
  it('detects bullish divergence (price LL, RSI HL)', () => {
    const n = 50;
    const closes = Array.from({ length: n }, (_, i) => 100 - i * 0.2);
    closes[20] = 90;
    closes[19] = 92;
    closes[21] = 92;
    closes[35] = 88;
    closes[34] = 90;
    closes[36] = 90;
    const rsi = Array.from({ length: n }, () => 40);
    rsi[20] = 25;
    rsi[35] = 32;
    const div = detectRsiDivergence(closes, rsi);
    expect(div?.kind).toBe('bullish');
  });

  it('detects bearish divergence (price HH, RSI LH)', () => {
    const n = 50;
    const closes = Array.from({ length: n }, (_, i) => 100 + i * 0.2);
    closes[20] = 110;
    closes[19] = 108;
    closes[21] = 108;
    closes[35] = 115;
    closes[34] = 113;
    closes[36] = 113;
    const rsi = Array.from({ length: n }, () => 60);
    rsi[20] = 75;
    rsi[35] = 68;
    const div = detectRsiDivergence(closes, rsi);
    expect(div?.kind).toBe('bearish');
  });
});

describe('donchian_volume / adx_ignition evaluate', () => {
  it('donchian_volume returns a result shape without throwing', () => {
    const candles = makeCandles(250);
    const last = candles[candles.length - 1]!;
    const priorHigh = Math.max(...candles.slice(-21, -1).map((c) => c.high));
    last.close = priorHigh + 2;
    last.high = last.close + 0.5;
    last.open = priorHigh;
    last.volume = 50_000;
    const indicators = computeAllIndicators(candles);
    const r = donchianVolumeStrategy.evaluate({
      symbol: 'TESTUSDT',
      timeframe: Timeframe.H1,
      candles,
      indicators,
      patterns: [],
    });
    expect(r.strategyId).toBe('donchian_volume');
    expect([Decision.BUY, Decision.SELL, Decision.NO_TRADE]).toContain(r.decision);
  });

  it('adx_ignition returns a result shape without throwing', () => {
    const candles = makeCandles(250);
    const indicators = computeAllIndicators(candles);
    const adx = indicators.adx14?.adx ?? [];
    const plus = indicators.adx14?.plusDI ?? [];
    const minus = indicators.adx14?.minusDI ?? [];
    if (adx.length > 15) {
      for (let i = adx.length - 12; i < adx.length - 2; i++) adx[i] = 15;
      adx[adx.length - 2] = 18;
      adx[adx.length - 1] = 25;
      plus[plus.length - 1] = 30;
      minus[minus.length - 1] = 10;
    }
    const patched: IndicatorSnapshot = {
      ...indicators,
      adx14: { adx, plusDI: plus, minusDI: minus },
    };
    const last = candles[candles.length - 1]!;
    last.close = last.open + 1;
    const r = adxIgnitionStrategy.evaluate({
      symbol: 'TESTUSDT',
      timeframe: Timeframe.H1,
      candles,
      indicators: patched,
      patterns: [],
    });
    expect(r.strategyId).toBe('adx_ignition');
    if (adx.length > 15) {
      expect(r.decision).toBe(Decision.BUY);
    }
  });
});

describe('new strategies registry', () => {
  it('includes new strategy ids and runAllStrategies stays green', () => {
    expect(STRATEGY_IDS).toContain('rsi_divergence');
    expect(STRATEGY_IDS).toContain('donchian_volume');
    expect(STRATEGY_IDS).toContain('adx_ignition');
    expect(STRATEGY_IDS).toContain('macd_divergence');
    expect(STRATEGY_IDS).toContain('inside_bar_nr7');
    expect(STRATEGY_IDS).toHaveLength(27);

    const candles = makeCandles(250);
    const indicators = computeAllIndicators(candles);
    const patterns = detectPatterns(candles, indicators);
    const results = runAllStrategies({
      symbol: 'BTCUSDT',
      timeframe: Timeframe.H1,
      candles,
      indicators,
      patterns,
    });
    expect(results.length).toBe(STRATEGY_IDS.length);
    void rsiDivergenceStrategy;
  });
});
