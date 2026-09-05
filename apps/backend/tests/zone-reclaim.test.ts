import { describe, expect, it } from 'vitest';
import { Decision, Timeframe, type Candle, type PatternHit } from '@trading-os/shared';
import { orderBlockStrategy } from '../src/modules/strategies/builtin/order-block.js';
import { fairValueGapStrategy } from '../src/modules/strategies/builtin/fair-value-gap.js';
import {
  isDemandZoneReclaim,
  isSupplyZoneReclaim,
} from '../src/modules/strategies/utils.js';
import type { StrategyContext } from '../src/modules/strategies/types.js';

function candle(partial: Partial<Candle> & Pick<Candle, 'open' | 'high' | 'low' | 'close'>): Candle {
  return {
    openTime: 0,
    volume: 1,
    closeTime: 1,
    ...partial,
  };
}

describe('isDemandZoneReclaim', () => {
  const zoneLow = 100;
  const zoneHigh = 102;

  it('rejects dump into zone without reclaim (red bar still in/below zone)', () => {
    expect(
      isDemandZoneReclaim(candle({ open: 103, high: 103.5, low: 100.5, close: 101 }), zoneLow, zoneHigh),
    ).toBe(false);
  });

  it('accepts wick into zone and bullish close above zone high', () => {
    expect(
      isDemandZoneReclaim(candle({ open: 101.5, high: 103, low: 100.2, close: 102.5 }), zoneLow, zoneHigh),
    ).toBe(true);
  });

  it('rejects close through the floor of the zone', () => {
    expect(
      isDemandZoneReclaim(candle({ open: 101, high: 101.5, low: 98, close: 99 }), zoneLow, zoneHigh),
    ).toBe(false);
  });
});

describe('isSupplyZoneReclaim', () => {
  const zoneLow = 100;
  const zoneHigh = 102;

  it('rejects rally into zone without reclaim', () => {
    expect(
      isSupplyZoneReclaim(candle({ open: 99, high: 101.5, low: 98.5, close: 101 }), zoneLow, zoneHigh),
    ).toBe(false);
  });

  it('accepts wick into zone and bearish close below zone low', () => {
    expect(
      isSupplyZoneReclaim(candle({ open: 101, high: 101.8, low: 98.5, close: 99.5 }), zoneLow, zoneHigh),
    ).toBe(true);
  });

  it('rejects close through the ceiling of the zone', () => {
    expect(
      isSupplyZoneReclaim(candle({ open: 101, high: 104, low: 100.5, close: 103 }), zoneLow, zoneHigh),
    ).toBe(false);
  });
});

function ctx(last: Candle, patterns: PatternHit[]): StrategyContext {
  return {
    symbol: 'BTCUSDT',
    timeframe: Timeframe.H1,
    candles: [candle({ open: 110, high: 111, low: 109, close: 110 }), last],
    indicators: { atr14: [2] },
    patterns,
  };
}

describe('order_block reclaim entry', () => {
  const bullishOb: PatternHit = {
    type: 'order_block',
    bullish: true,
    confidence: 70,
    price: 101,
    index: 0,
    meta: { high: 102, low: 100 },
  };

  it('does not BUY on raw overlap while dumping into the zone', () => {
    const last = candle({ open: 103, high: 103.2, low: 100.5, close: 101 });
    const result = orderBlockStrategy.evaluate(ctx(last, [bullishOb]));
    expect(result.decision).toBe(Decision.NO_TRADE);
  });

  it('BUYs on bullish reclaim of the order block', () => {
    const last = candle({ open: 101.2, high: 103.5, low: 100.3, close: 102.8 });
    const result = orderBlockStrategy.evaluate(ctx(last, [bullishOb]));
    expect(result.decision).toBe(Decision.BUY);
  });
});

describe('fair_value_gap reclaim entry', () => {
  const bullishFvg: PatternHit = {
    type: 'fair_value_gap',
    bullish: true,
    confidence: 68,
    price: 101,
    index: 0,
    meta: { gapHigh: 102, gapLow: 100 },
  };

  it('does not BUY on raw overlap without reclaim', () => {
    const last = candle({ open: 103, high: 103.2, low: 100.5, close: 101 });
    const result = fairValueGapStrategy.evaluate(ctx(last, [bullishFvg]));
    expect(result.decision).toBe(Decision.NO_TRADE);
  });

  it('BUYs on bullish FVG reclaim', () => {
    const last = candle({ open: 101.2, high: 103.5, low: 100.3, close: 102.8 });
    const result = fairValueGapStrategy.evaluate(ctx(last, [bullishFvg]));
    expect(result.decision).toBe(Decision.BUY);
  });
});
