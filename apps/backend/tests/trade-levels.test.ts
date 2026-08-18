import { describe, it, expect } from 'vitest';
import { Side } from '@trading-os/shared';
import {
  entryDriftExceeded,
  reanchorRiskLevels,
} from '../src/modules/trade/levels.js';
import { validateRisk } from '../src/modules/risk/index.js';
import { MarketRegime } from '@trading-os/shared';

const baseRisk = {
  maxRiskPerTrade: 0.01,
  maxDailyLoss: 0.05,
  maxOpenPositions: 5,
  minRiskReward: 2,
  maxSpreadBps: 20,
  minLiquidityUsdt: 0,
  atrSlMultiplierMin: 0.1,
  atrSlMultiplierMax: 10,
  maxFreeNotionalPct: 1,
  minNotionalPerTrade: 0,
};

describe('reanchorRiskLevels', () => {
  it('BUY: preserves SL/TP distances from signal onto fill', () => {
    // signal: entry 100, SL 98 (dist 2), TP 104 (dist 4) → RR 2
    const levels = reanchorRiskLevels(Side.BUY, 101, 100, 98, 104);
    expect(levels.slDist).toBe(2);
    expect(levels.tpDist).toBe(4);
    expect(levels.stopLoss).toBe(99);
    expect(levels.takeProfit).toBe(105);
    expect(levels.initialStopLoss).toBe(99);
    expect(levels.riskReward).toBe(2);
  });

  it('SELL: preserves distances above/below fill', () => {
    const levels = reanchorRiskLevels(Side.SELL, 99, 100, 102, 96);
    expect(levels.stopLoss).toBe(101);
    expect(levels.takeProfit).toBe(95);
    expect(levels.riskReward).toBe(2);
  });

  it('without re-anchor, adverse fill would inflate risk; with re-anchor risk stays 1R', () => {
    const signalEntry = 100;
    const signalSl = 98;
    const signalTp = 104;
    const fill = 101;
    const equity = 10_000;
    const maxRisk = 0.01;
    const riskAmount = equity * maxRisk;
    const slDist = Math.abs(signalEntry - signalSl);
    const qty = riskAmount / slDist;

    // Bug case: keep signal SL after fill → actual $ risk > maxRiskPerTrade
    const inflatedRisk = qty * Math.abs(fill - signalSl);
    expect(inflatedRisk).toBeGreaterThan(riskAmount);

    const levels = reanchorRiskLevels(Side.BUY, fill, signalEntry, signalSl, signalTp);
    const actualRisk = qty * Math.abs(fill - levels.stopLoss);
    expect(actualRisk).toBeCloseTo(riskAmount, 8);
  });
});

describe('entryDriftExceeded', () => {
  it('allows fills within 2%', () => {
    expect(entryDriftExceeded(100, 101.5)).toBe(false);
  });

  it('rejects fills beyond 2%', () => {
    expect(entryDriftExceeded(100, 102.1)).toBe(true);
  });
});

describe('validateRisk after re-anchor', () => {
  it('sizes qty so fill→SL risk ≈ maxRiskPerTrade', async () => {
    const signalEntry = 100;
    const signalSl = 98;
    const signalTp = 104;
    const fill = 101;
    const levels = reanchorRiskLevels(Side.BUY, fill, signalEntry, signalSl, signalTp);
    const equity = 10_000;

    const result = await validateRisk({
      userId: '000000000000000000000001',
      equity,
      freeQuote: equity,
      risk: { ...baseRisk, maxOpenPositions: 1 },
      opportunity: {
        symbol: 'BTCUSDT',
        timeframe: '1h' as never,
        side: Side.BUY,
        confidence: 80,
        entry: fill,
        stopLoss: levels.stopLoss,
        takeProfit: levels.takeProfit,
        riskReward: levels.riskReward,
        strategyIds: ['breakout'],
        primaryStrategy: 'breakout',
        evidence: [],
        regime: MarketRegime.TRENDING_BULL,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.qty).toBeDefined();
    const dollarRisk = (result.qty ?? 0) * Math.abs(fill - levels.stopLoss);
    expect(dollarRisk).toBeCloseTo(equity * baseRisk.maxRiskPerTrade, 0);
  });
});
