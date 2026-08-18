import { describe, it, expect } from 'vitest';
import {
  alreadyOpenOnSymbolReason,
  hasOpenPositionOnSymbol,
  positionNotionalCap,
  softPrecheck,
  validateRisk,
} from '../src/modules/risk/index.js';
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
  it('hasOpenPositionOnSymbol is true for any side of the same pair', () => {
    const open = [{ symbol: 'BTCUSDT' }, { symbol: 'ETHUSDT' }];
    expect(hasOpenPositionOnSymbol(open, 'BTCUSDT')).toBe(true);
    expect(hasOpenPositionOnSymbol(open, 'ETHUSDT')).toBe(true);
    expect(hasOpenPositionOnSymbol(open, 'SOLUSDT')).toBe(false);
    expect(hasOpenPositionOnSymbol([], 'BTCUSDT')).toBe(false);
    expect(alreadyOpenOnSymbolReason('BTCUSDT')).toBe(
      'Already have an open position in BTCUSDT',
    );
  });

  it('positionNotionalCap splits equity evenly across X slots', () => {
    expect(
      positionNotionalCap({
        equity: 2100,
        freeQuote: 2100,
        maxOpenPositions: 2,
        maxFreeNotionalPct: 1,
      }),
    ).toBe(1050);
    expect(
      positionNotionalCap({
        equity: 2100,
        freeQuote: 1050,
        maxOpenPositions: 2,
        maxFreeNotionalPct: 1,
      }),
    ).toBe(1050);
    expect(
      positionNotionalCap({
        equity: 2100,
        freeQuote: 1400,
        maxOpenPositions: 3,
        maxFreeNotionalPct: 1,
      }),
    ).toBe(700);
  });

  it('positionNotionalCap uses equity % when tighter than a slot', () => {
    expect(
      positionNotionalCap({
        equity: 10_000,
        freeQuote: 10_000,
        maxOpenPositions: 2,
        maxFreeNotionalPct: 0.25,
      }),
    ).toBe(2500);
  });

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

  it('caps notional to maxFreeNotionalPct of equity when tighter than a slot', async () => {
    const equity = 10_000;
    const result = await validateRisk({
      userId: '000000000000000000000001',
      equity,
      freeQuote: equity,
      risk: {
        ...baseRisk,
        maxOpenPositions: 2,
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
    expect((result.qty ?? 0) * 95_000).toBeLessThanOrEqual(equity * 0.25 + 1e-6);
  });

  it('caps a tight-stop fill at equity / 2 slots, not the full book', async () => {
    const equity = 2100;
    const result = await validateRisk({
      userId: '000000000000000000000001',
      equity,
      freeQuote: equity,
      risk: {
        ...baseRisk,
        maxRiskPerTrade: 0.05,
        maxOpenPositions: 2,
        maxFreeNotionalPct: 1,
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
    const notional = (result.qty ?? 0) * 95_000;
    expect(notional).toBeLessThanOrEqual(equity / 2 + 1e-6);
    expect(notional).toBeGreaterThan(equity / 2 - 95_000 * 0.001);
  });

  it('second fill may use remaining cash up to one slot', async () => {
    const equity = 2100;
    const remaining = 1050;
    const result = await validateRisk({
      userId: '000000000000000000000001',
      equity,
      freeQuote: remaining,
      risk: {
        ...baseRisk,
        maxRiskPerTrade: 0.05,
        maxOpenPositions: 2,
        maxFreeNotionalPct: 1,
        atrSlMultiplierMin: 0.01,
        atrSlMultiplierMax: 100,
      },
      opportunity: {
        symbol: 'ETHUSDT',
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
    const notional = (result.qty ?? 0) * 95_000;
    expect(notional).toBeLessThanOrEqual(remaining + 1e-6);
    expect(notional).toBeGreaterThan(remaining * 0.7);
  });

  it('caps a tight-stop fill at equity / 3 slots', async () => {
    const equity = 2100;
    const slot = equity / 3;
    const result = await validateRisk({
      userId: '000000000000000000000001',
      equity,
      freeQuote: 1400,
      risk: {
        ...baseRisk,
        maxRiskPerTrade: 0.05,
        maxOpenPositions: 3,
        maxFreeNotionalPct: 1,
        atrSlMultiplierMin: 0.01,
        atrSlMultiplierMax: 100,
      },
      opportunity: {
        symbol: 'SOLUSDT',
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
    const notional = (result.qty ?? 0) * 95_000;
    expect(notional).toBeLessThanOrEqual(slot + 1e-6);
    expect(notional).toBeGreaterThan(slot * 0.7);
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
