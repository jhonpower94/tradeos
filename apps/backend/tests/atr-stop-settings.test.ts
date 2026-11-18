import { describe, expect, it } from 'vitest';
import { Decision } from '@trading-os/shared';
import { applyAtrStopAndRr, buildLongLevels } from '../src/modules/strategies/utils.js';

describe('applyAtrStopAndRr', () => {
  it('sets BUY stop to atrSlMultiplier × ATR and TP to minRR × risk', () => {
    const base = {
      strategyId: 'ema_pullback' as const,
      decision: Decision.BUY,
      confidence: 70,
      ...buildLongLevels(100, 2, 1.5, 2),
      evidence: [],
    };
    const tight = applyAtrStopAndRr(base, 2, 1.0, 2);
    expect(tight.stopLoss).toBeCloseTo(100 - 2, 8);
    expect(tight.takeProfit).toBeCloseTo(100 + 4, 8);
    expect(tight.riskReward).toBe(2);

    const wide = applyAtrStopAndRr(base, 2, 1.5, 2);
    expect(wide.stopLoss).toBeCloseTo(100 - 3, 8);
    expect(wide.takeProfit).toBeCloseTo(100 + 6, 8);
  });

  it('sets SELL stop above entry by atrSlMultiplier × ATR', () => {
    const res = applyAtrStopAndRr(
      {
        strategyId: 'resistance_rejection',
        decision: Decision.SELL,
        confidence: 70,
        entry: 100,
        stopLoss: 103,
        takeProfit: 94,
        riskReward: 2,
        evidence: [],
      },
      2,
      1.0,
      2,
    );
    expect(res.stopLoss).toBeCloseTo(102, 8);
    expect(res.takeProfit).toBeCloseTo(96, 8); // 2R below entry
  });

  it('applies 0.2% entry floor when ATR stop would be smaller', () => {
    const res = applyAtrStopAndRr(
      {
        strategyId: 'ema_pullback',
        decision: Decision.BUY,
        confidence: 70,
        entry: 100,
        stopLoss: 99,
        takeProfit: 102,
        riskReward: 2,
        evidence: [],
      },
      0.01,
      1.0,
      2,
    );
    // max(0.01, 100*0.002) = 0.2
    expect(res.stopLoss).toBeCloseTo(99.8, 8);
    expect(res.takeProfit).toBeCloseTo(100.4, 8);
  });

  it('leaves NO_TRADE unchanged', () => {
    const nt = {
      strategyId: 'ema_pullback' as const,
      decision: Decision.NO_TRADE,
      confidence: 0,
      evidence: [],
    };
    expect(applyAtrStopAndRr(nt, 2, 1.0, 2)).toEqual(nt);
  });
});
