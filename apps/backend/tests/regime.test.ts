import { describe, it, expect } from 'vitest';
import {
  MarketRegime,
  filterStrategiesForRegime,
  getCompatibleStrategyIds,
  isStrategyCompatibleWithRegime,
} from '@trading-os/shared';
import { detectRegime } from '../src/modules/regime/index.js';
import { computeAllIndicators } from '../src/modules/indicators/index.js';
import type { Candle, IndicatorSnapshot } from '@trading-os/shared';

function makeTrendingCandles(n: number, up = true): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price += up ? 0.8 + (i % 3) * 0.1 : -(0.8 + (i % 3) * 0.1);
    out.push({
      openTime: i * 60_000,
      open: price - 0.2,
      high: price + 1.5,
      low: price - 1.5,
      close: price,
      volume: 2000 + i * 10,
      closeTime: i * 60_000 + 59_999,
    });
  }
  return out;
}

function makeRangingCandles(n: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const price = 100 + Math.sin(i / 4) * 0.4;
    out.push({
      openTime: i * 60_000,
      open: price - 0.1,
      high: price + 0.3,
      low: price - 0.3,
      close: price,
      volume: 800,
      closeTime: i * 60_000 + 59_999,
    });
  }
  return out;
}

describe('detectRegime', () => {
  it('detects trending_bull on strong uptrend', () => {
    const snap = computeAllIndicators(makeTrendingCandles(250, true));
    const r = detectRegime(snap);
    expect([MarketRegime.TRENDING_BULL, MarketRegime.TRENDING_BEAR, MarketRegime.VOLATILE]).toContain(
      r.regime,
    );
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it('detects ranging or unknown on flat series', () => {
    const snap = computeAllIndicators(makeRangingCandles(250));
    const r = detectRegime(snap);
    expect([
      MarketRegime.RANGING,
      MarketRegime.VOLATILE,
      MarketRegime.UNKNOWN,
      MarketRegime.TRENDING_BULL,
      MarketRegime.TRENDING_BEAR,
    ]).toContain(r.regime);
  });

  it('returns unknown-friendly structure for empty-ish indicators', () => {
    const empty: IndicatorSnapshot = {};
    const r = detectRegime(empty);
    expect(r.regime).toBe(MarketRegime.RANGING);
    expect(r.adx).toBe(0);
  });
});

describe('strategy regime filter', () => {
  it('returns no strategies for unknown', () => {
    expect(getCompatibleStrategyIds(MarketRegime.UNKNOWN)).toEqual([]);
  });

  it('includes trend strategies for trending_bull', () => {
    const ids = getCompatibleStrategyIds(MarketRegime.TRENDING_BULL);
    expect(ids).toContain('supertrend');
    expect(ids).toContain('ema_cross');
    expect(ids).not.toContain('vwap_reversion');
  });

  it('includes mean-reversion for ranging', () => {
    const ids = getCompatibleStrategyIds(MarketRegime.RANGING);
    expect(ids).toContain('bollinger_reversal');
    expect(ids).toContain('support_bounce');
    expect(ids).not.toContain('supertrend');
  });

  it('filters enabled map by regime', () => {
    const filtered = filterStrategiesForRegime(
      {
        supertrend: { enabled: true },
        vwap_reversion: { enabled: true },
      },
      MarketRegime.TRENDING_BULL,
    );
    expect(filtered.supertrend?.enabled).toBe(true);
    expect(filtered.vwap_reversion?.enabled).toBe(false);
  });

  it('isStrategyCompatibleWithRegime matches map', () => {
    expect(isStrategyCompatibleWithRegime('supertrend', MarketRegime.TRENDING_BEAR)).toBe(true);
    expect(isStrategyCompatibleWithRegime('supertrend', MarketRegime.RANGING)).toBe(false);
    expect(isStrategyCompatibleWithRegime('ema_pullback', MarketRegime.UNKNOWN)).toBe(false);
  });
});
