import { describe, it, expect } from 'vitest';
import { softPrecheck, validateRisk } from '../src/modules/risk/index.js';
import { buildConsensus, detectRegime } from '../src/modules/consensus/index.js';
import { Decision, MarketRegime, Side, type StrategyResult } from '@trading-os/shared';
import { computeAllIndicators } from '../src/modules/indicators/index.js';
import { setTickerPrice } from '../src/modules/market-data/index.js';
import type { Candle } from '@trading-os/shared';

const baseRisk = {
  maxRiskPerTrade: 0.01,
  maxDailyLoss: 0.05,
  maxOpenPositions: 5,
  minRiskReward: 2,
  maxSpreadBps: 20,
  minLiquidityUsdt: 0,
  atrSlMultiplierMin: 0.5,
  atrSlMultiplierMax: 5,
  maxFreeNotionalPct: 0.25,
};

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

describe('risk', () => {
  it('rejects bad RR', async () => {
    const result = await validateRisk({
      userId: '000000000000000000000001',
      equity: 10000,
      freeQuote: 10000,
      risk: { ...baseRisk, atrSlMultiplierMin: 0.1, atrSlMultiplierMax: 10 },
      opportunity: {
        symbol: 'BTCUSDT',
        timeframe: '1h' as never,
        side: Side.BUY,
        confidence: 80,
        entry: 100,
        stopLoss: 99,
        takeProfit: 100.5,
        riskReward: 0.5,
        strategyIds: ['breakout'],
        primaryStrategy: 'breakout',
        evidence: [],
        regime: MarketRegime.TRENDING_BULL,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('RR'))).toBe(true);
  });

  it('rejects stop loss outside ATR band', async () => {
    const result = await validateRisk({
      userId: '000000000000000000000001',
      equity: 10000,
      freeQuote: 10000,
      risk: baseRisk,
      atr: 1,
      opportunity: {
        symbol: 'BTCUSDT',
        timeframe: '1h' as never,
        side: Side.BUY,
        confidence: 80,
        entry: 100,
        stopLoss: 99.9,
        takeProfit: 102,
        riskReward: 20,
        strategyIds: ['breakout'],
        primaryStrategy: 'breakout',
        evidence: [],
        regime: MarketRegime.TRENDING_BULL,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('ATR'))).toBe(true);
  });

  it('softPrecheck rejects entry drift over 2%', async () => {
    setTickerPrice('BTCUSDT', 110);
    const result = await softPrecheck(
      '000000000000000000000001',
      {
        symbol: 'BTCUSDT',
        timeframe: '1h' as never,
        side: Side.BUY,
        confidence: 80,
        entry: 100,
        stopLoss: 98,
        takeProfit: 104,
        riskReward: 2,
        strategyIds: ['breakout'],
        primaryStrategy: 'breakout',
        evidence: [],
        regime: MarketRegime.TRENDING_BULL,
      },
      baseRisk,
      10_000,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/drifted/i);
  });

  it('caps size so notional stays within freeQuote on tight SL', async () => {
    const freeQuote = 10_000;
    const result = await validateRisk({
      userId: '000000000000000000000001',
      equity: 10_000,
      freeQuote,
      risk: { ...baseRisk, atrSlMultiplierMin: 0.01, atrSlMultiplierMax: 100 },
      opportunity: {
        symbol: 'BTCUSDT',
        timeframe: '1h' as never,
        side: Side.BUY,
        confidence: 80,
        entry: 95_000,
        stopLoss: 94_800,
        takeProfit: 95_400,
        riskReward: 2,
        strategyIds: ['breakout'],
        primaryStrategy: 'breakout',
        evidence: [],
        regime: MarketRegime.TRENDING_BULL,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.qty).toBeDefined();
    expect((result.qty ?? 0) * 95_000).toBeLessThanOrEqual(freeQuote);
  });

  it('caps notional to maxFreeNotionalPct of freeQuote', async () => {
    const freeQuote = 10_000;
    const result = await validateRisk({
      userId: '000000000000000000000001',
      equity: 10_000,
      freeQuote,
      risk: {
        ...baseRisk,
        maxFreeNotionalPct: 0.25,
        atrSlMultiplierMin: 0.01,
        atrSlMultiplierMax: 100,
      },
      opportunity: {
        symbol: 'BTCUSDT',
        timeframe: '1h' as never,
        side: Side.BUY,
        confidence: 80,
        entry: 95_000,
        stopLoss: 94_800,
        takeProfit: 95_400,
        riskReward: 2,
        strategyIds: ['breakout'],
        primaryStrategy: 'breakout',
        evidence: [],
        regime: MarketRegime.TRENDING_BULL,
      },
    });
    expect(result.ok).toBe(true);
    expect((result.qty ?? 0) * 95_000).toBeLessThanOrEqual(freeQuote * 0.25 + 1e-6);
  });
});

describe('consensus', () => {
  it('aggregates bullish strategies', () => {
    const strategies: StrategyResult[] = [buyStrategy('ema_cross'), buyStrategy('macd_momentum', 75)];
    const indicators = computeAllIndicators(bullishCandles());
    const c = buildConsensus({
      strategies,
      patterns: [],
      indicators,
      minAlignedStrategies: 2,
      minAgreementRatio: 0.6,
    });
    expect(c.side).toBe(Side.BUY);
    expect(c.veto).toBeUndefined();
    expect(c.score).toBeGreaterThan(0);
    expect(detectRegime(indicators).regime).toBeDefined();
  });

  it('vetoes single-strategy agreement', () => {
    const strategies: StrategyResult[] = [buyStrategy('ema_cross')];
    const indicators = computeAllIndicators(bullishCandles());
    const c = buildConsensus({
      strategies,
      patterns: [],
      indicators,
      minAlignedStrategies: 2,
      minAgreementRatio: 0.6,
    });
    expect(c.side).toBe(Side.BUY);
    expect(c.veto).toBe('Insufficient strategy agreement');
  });

  it('vetoes SELL in trending_bull regime', () => {
    const strategies: StrategyResult[] = [
      sellStrategy('ema_cross'),
      sellStrategy('macd_momentum', 75),
    ];
    const indicators = computeAllIndicators(bullishCandles());
    const regimeResult = {
      regime: MarketRegime.TRENDING_BULL,
      confidence: 80,
      evidence: [],
      adx: 30,
      bbWidthPct: 2,
      plusDI: 30,
      minusDI: 10,
    };
    const c = buildConsensus({
      strategies,
      patterns: [],
      indicators,
      regimeResult,
      minAlignedStrategies: 2,
      minAgreementRatio: 0.6,
    });
    expect(c.side).toBe(Side.SELL);
    expect(c.veto).toBe('Strong opposing market regime');
  });
});
