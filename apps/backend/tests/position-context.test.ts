import { describe, it, expect } from 'vitest';
import { MarketRegime, Side } from '@trading-os/shared';
import { evaluatePositionBias } from '../src/modules/position/context.js';

describe('evaluatePositionBias', () => {
  it('holds when HTF and regime aligned with long', () => {
    const r = evaluatePositionBias({
      side: Side.BUY,
      regime: MarketRegime.TRENDING_BULL,
      htfTrend: 'bull',
    });
    expect(r.suggestion).toBe('hold');
    expect(r.aligned).toBe(true);
  });

  it('suggests close when HTF opposes long', () => {
    const r = evaluatePositionBias({
      side: Side.BUY,
      regime: MarketRegime.RANGING,
      htfTrend: 'bear',
    });
    expect(r.suggestion).toBe('consider_close');
    expect(r.htfOpposing).toBe(true);
    expect(r.aligned).toBe(false);
    expect(r.message).toMatch(/consider close/i);
  });

  it('suggests close when regime is opposing trend', () => {
    const r = evaluatePositionBias({
      side: Side.SELL,
      regime: MarketRegime.TRENDING_BULL,
      htfTrend: 'bear',
    });
    expect(r.regimeOpposing).toBe(true);
    expect(r.suggestion).toBe('consider_close');
  });

  it('uses DI for trending_volatile', () => {
    const r = evaluatePositionBias({
      side: Side.BUY,
      regime: MarketRegime.TRENDING_VOLATILE,
      plusDI: 10,
      minusDI: 25,
      htfTrend: 'bull',
    });
    expect(r.regimeOpposing).toBe(true);
    expect(r.suggestion).toBe('consider_close');
  });
});
