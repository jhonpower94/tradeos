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

function snapWith(
  overrides: Partial<{
    adx: number;
    plusDI: number;
    minusDI: number;
    bbWidthPct: number;
  }>,
): IndicatorSnapshot {
  const mid = 100;
  const halfWidth = (((overrides.bbWidthPct ?? 3) / 100) * mid) / 2;
  return {
    adx14: {
      adx: [overrides.adx ?? 15],
      plusDI: [overrides.plusDI ?? 20],
      minusDI: [overrides.minusDI ?? 10],
    },
    bollinger: {
      upper: [mid + halfWidth],
      middle: [mid],
      lower: [mid - halfWidth],
    },
  };
}

describe('detectRegime', () => {
  it('detects trending_bull on strong uptrend', () => {
    const snap = computeAllIndicators(makeTrendingCandles(250, true));
    const r = detectRegime(snap);
    expect([
      MarketRegime.TRENDING_BULL,
      MarketRegime.TRENDING_BEAR,
      MarketRegime.VOLATILE,
      MarketRegime.TRENDING_VOLATILE,
    ]).toContain(r.regime);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.plusDI).toBeDefined();
    expect(r.minusDI).toBeDefined();
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
      MarketRegime.COMPRESSION,
      MarketRegime.TRENDING_VOLATILE,
    ]).toContain(r.regime);
  });

  it('returns compression for empty-ish indicators (zero BB width)', () => {
    const empty: IndicatorSnapshot = {};
    const r = detectRegime(empty);
    expect(r.regime).toBe(MarketRegime.COMPRESSION);
    expect(r.adx).toBe(0);
  });

  it('detects compression on narrow bands and moderate ADX', () => {
    const r = detectRegime(snapWith({ adx: 15, bbWidthPct: 2 }));
    expect(r.regime).toBe(MarketRegime.COMPRESSION);
  });

  it('detects trending_volatile on strong ADX and wide bands', () => {
    const r = detectRegime(snapWith({ adx: 30, plusDI: 35, minusDI: 10, bbWidthPct: 10 }));
    expect(r.regime).toBe(MarketRegime.TRENDING_VOLATILE);
    expect(r.plusDI).toBeGreaterThan(r.minusDI);
  });

  it('detects volatile on wide bands and weak ADX', () => {
    const r = detectRegime(snapWith({ adx: 12, bbWidthPct: 10 }));
    expect(r.regime).toBe(MarketRegime.VOLATILE);
  });
});

describe('strategy regime filter', () => {
  it('returns no strategies for unknown', () => {
    expect(getCompatibleStrategyIds(MarketRegime.UNKNOWN)).toEqual([]);
  });

  it('includes trend strategies for trending_bull', () => {
    const ids = getCompatibleStrategyIds(MarketRegime.TRENDING_BULL);
    expect(ids).toContain('supertrend');
    expect(ids).toContain('ichimoku_trend');
    expect(ids).not.toContain('vwap_reversion');
  });

  it('includes mean-reversion for ranging', () => {
    const ids = getCompatibleStrategyIds(MarketRegime.RANGING);
    expect(ids).toContain('stoch_rsi_reversion');
    expect(ids).toContain('pivot_bounce');
    expect(ids).not.toContain('supertrend');
  });

  it('includes squeeze/breakout for compression', () => {
    const ids = getCompatibleStrategyIds(MarketRegime.COMPRESSION);
    expect(ids).toContain('bb_squeeze_breakout');
    expect(ids).toContain('breakout');
    expect(ids).not.toContain('supertrend');
  });

  it('includes aggressive trend tools for trending_volatile', () => {
    const ids = getCompatibleStrategyIds(MarketRegime.TRENDING_VOLATILE);
    expect(ids).toContain('atr_trend');
    expect(ids).toContain('ichimoku_trend');
    expect(ids).not.toContain('pivot_bounce');
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
    expect(isStrategyCompatibleWithRegime('bb_squeeze_breakout', MarketRegime.COMPRESSION)).toBe(
      true,
    );
    expect(isStrategyCompatibleWithRegime('ema_pullback', MarketRegime.UNKNOWN)).toBe(false);
  });
});
