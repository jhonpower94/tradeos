import { describe, it, expect } from 'vitest';
import { Decision, Side, Timeframe, type StrategyResult } from '@trading-os/shared';
import { buildConsensus } from '../src/modules/consensus/index.js';
import { resolveParentTimeframe } from '../src/modules/consensus/htf.js';
import { computeAllIndicators } from '../src/modules/indicators/index.js';
import type { Candle } from '@trading-os/shared';

function buyStrategy(id: string, confidence = 80): StrategyResult {
  return {
    strategyId: id as StrategyResult['strategyId'],
    decision: Decision.BUY,
    confidence,
    entry: 100,
    stopLoss: 98,
    takeProfit: 104,
    riskReward: 2,
    evidence: [],
  };
}

function sellStrategy(id: string, confidence = 80): StrategyResult {
  return {
    strategyId: id as StrategyResult['strategyId'],
    decision: Decision.SELL,
    confidence,
    entry: 100,
    stopLoss: 102,
    takeProfit: 96,
    riskReward: 2,
    evidence: [],
  };
}

function bullishCandles(): Candle[] {
  return Array.from({ length: 250 }, (_, i) => ({
    openTime: i,
    open: 100 + i * 0.1,
    high: 101 + i * 0.1,
    low: 99 + i * 0.1,
    close: 100.5 + i * 0.1,
    volume: 1000,
    closeTime: i + 1,
  }));
}

describe('resolveParentTimeframe', () => {
  it('maps lower TFs to parents', () => {
    expect(resolveParentTimeframe(Timeframe.M15)).toBe(Timeframe.H1);
    expect(resolveParentTimeframe(Timeframe.H1)).toBe(Timeframe.H4);
    expect(resolveParentTimeframe(Timeframe.H4)).toBe(Timeframe.D1);
    expect(resolveParentTimeframe(Timeframe.D1)).toBeNull();
  });
});

describe('HTF hard veto', () => {
  it('vetoes BUY when HTF is bear', () => {
    const indicators = computeAllIndicators(bullishCandles());
    const c = buildConsensus({
      strategies: [buyStrategy('ema_cross'), buyStrategy('macd_momentum', 75)],
      patterns: [],
      indicators,
      htfTrend: 'bear',
      htfVetoEnabled: true,
      minAlignedStrategies: 2,
      minAgreementRatio: 0.6,
      regimeResult: {
        regime: 'ranging' as never,
        confidence: 60,
        evidence: [],
        adx: 15,
        bbWidthPct: 3,
        plusDI: 20,
        minusDI: 18,
      },
    });
    expect(c.side).toBe(Side.BUY);
    expect(c.veto).toBe('HTF trend opposing');
  });

  it('allows BUY when HTF is bull', () => {
    const indicators = computeAllIndicators(bullishCandles());
    const c = buildConsensus({
      strategies: [buyStrategy('ema_cross'), buyStrategy('macd_momentum', 75)],
      patterns: [],
      indicators,
      htfTrend: 'bull',
      htfVetoEnabled: true,
      minAlignedStrategies: 2,
      minAgreementRatio: 0.6,
      regimeResult: {
        regime: 'ranging' as never,
        confidence: 60,
        evidence: [],
        adx: 15,
        bbWidthPct: 3,
        plusDI: 20,
        minusDI: 18,
      },
    });
    expect(c.side).toBe(Side.BUY);
    expect(c.veto).toBeUndefined();
  });

  it('vetoes SELL when HTF is bull', () => {
    const indicators = computeAllIndicators(bullishCandles());
    const c = buildConsensus({
      strategies: [sellStrategy('ema_cross'), sellStrategy('macd_momentum', 75)],
      patterns: [],
      indicators,
      htfTrend: 'bull',
      htfVetoEnabled: true,
      minAlignedStrategies: 2,
      minAgreementRatio: 0.6,
      regimeResult: {
        regime: 'ranging' as never,
        confidence: 60,
        evidence: [],
        adx: 15,
        bbWidthPct: 3,
        plusDI: 20,
        minusDI: 18,
      },
    });
    expect(c.side).toBe(Side.SELL);
    expect(c.veto).toBe('HTF trend opposing');
  });
});

describe('trending_volatile DI veto', () => {
  it('vetoes BUY when -DI dominates', () => {
    const indicators = computeAllIndicators(bullishCandles());
    const c = buildConsensus({
      strategies: [buyStrategy('atr_trend'), buyStrategy('volume_breakout', 75)],
      patterns: [],
      indicators,
      minAlignedStrategies: 2,
      minAgreementRatio: 0.6,
      regimeResult: {
        regime: 'trending_volatile' as never,
        confidence: 85,
        evidence: [],
        adx: 32,
        bbWidthPct: 10,
        plusDI: 12,
        minusDI: 28,
      },
    });
    expect(c.side).toBe(Side.BUY);
    expect(c.veto).toBe('Strong opposing market regime');
  });
});
