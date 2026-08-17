import { describe, expect, it } from 'vitest';
import { MarketRegime, Side, Timeframe, type IndicatorSnapshot, type PatternHit } from '@trading-os/shared';
import {
  buildWatchingOpportunity,
  computeRelativeStrength,
  findNearbyLocations,
  locationBias,
  previousDayLevels,
  relativeStrengthAligned,
  watchingSide,
} from '../src/modules/location/index.js';

const emptyIndicators: IndicatorSnapshot = {};

describe('findNearbyLocations', () => {
  it('keeps levels inside the ATR proximity', () => {
    const patterns: PatternHit[] = [
      { type: 'support', bullish: true, confidence: 80, price: 100 },
    ];
    const nearby = findNearbyLocations({
      close: 105,
      atr: 10,
      proximityAtr: 1.5,
      indicators: emptyIndicators,
      patterns,
    });
    expect(nearby).toHaveLength(1);
    expect(nearby[0]!.type).toBe('support');
    expect(nearby[0]!.distanceAtr).toBeCloseTo(0.5);
  });

  it('returns empty when all levels are too far', () => {
    const patterns: PatternHit[] = [
      { type: 'resistance', bullish: false, confidence: 80, price: 140 },
    ];
    const nearby = findNearbyLocations({
      close: 100,
      atr: 10,
      proximityAtr: 1.5,
      indicators: emptyIndicators,
      patterns,
    });
    expect(nearby).toEqual([]);
  });

  it('includes VWAP, pivots, and PDH/PDL when close', () => {
    const nearby = findNearbyLocations({
      close: 100,
      atr: 2,
      proximityAtr: 1.5,
      indicators: {
        vwap: [99.5],
        pivots: { pivot: 100.5, r1: 120, r2: 130, r3: 140, s1: 80, s2: 70, s3: 60 },
      },
      patterns: [],
      pdhPdl: { high: 101, low: 99 },
    });
    const types = nearby.map((l) => l.type);
    expect(types).toContain('vwap');
    expect(types).toContain('pivot');
    expect(types).toContain('pdh');
    expect(types).toContain('pdl');
    expect(types).not.toContain('r1');
  });
});

describe('relativeStrengthAligned', () => {
  it('vetoes BUY when RS is negative', () => {
    expect(relativeStrengthAligned(Side.BUY, -1.2)).toBe(false);
  });

  it('vetoes SELL when RS is positive', () => {
    expect(relativeStrengthAligned(Side.SELL, 2.4)).toBe(false);
  });

  it('does not veto when BTC RS is missing', () => {
    expect(relativeStrengthAligned(Side.BUY, undefined)).toBe(true);
    expect(relativeStrengthAligned(Side.SELL, undefined)).toBe(true);
  });

  it('computes symbol minus BTC percent', () => {
    expect(computeRelativeStrength(5, 2)).toBe(3);
    expect(computeRelativeStrength(undefined, 2)).toBeUndefined();
  });
});

describe('watching vs triggered helpers', () => {
  it('uses HTF trend for watching side before location bias', () => {
    const support = {
      type: 'support' as const,
      price: 100,
      distanceAtr: 0.2,
    };
    expect(watchingSide('bear', [support])).toBe(Side.SELL);
    expect(watchingSide(null, [support])).toBe(Side.BUY);
    expect(locationBias({ type: 'pdh', price: 1, distanceAtr: 0.1 })).toBe(Side.SELL);
  });

  it('builds a watching opportunity below min confidence', () => {
    const opp = buildWatchingOpportunity({
      symbol: 'ETHUSDT',
      timeframe: Timeframe.H1,
      side: Side.BUY,
      nearby: [{ type: 'support', price: 2000, distanceAtr: 0.4 }],
      atr: 20,
      minRR: 2,
      minConfidence: 75,
      regime: MarketRegime.RANGING,
      relativeStrength: 1.5,
    });
    expect(opp.stage).toBe('watching');
    expect(opp.confidence).toBeLessThan(75);
    expect(opp.entry).toBe(2000);
    expect(opp.primaryStrategy).toBe('support_bounce');
    expect(opp.relativeStrength).toBe(1.5);
  });
});

describe('previousDayLevels', () => {
  it('reads high/low from the previous completed daily candle', () => {
    const levels = previousDayLevels([
      {
        openTime: 1,
        open: 1,
        high: 10,
        low: 2,
        close: 5,
        volume: 1,
        closeTime: 2,
      },
      {
        openTime: 3,
        open: 5,
        high: 20,
        low: 4,
        close: 8,
        volume: 1,
        closeTime: 4,
      },
    ]);
    expect(levels).toEqual({ high: 10, low: 2 });
  });
});
