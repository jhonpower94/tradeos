import { describe, it, expect } from 'vitest';
import { Decision, Timeframe } from '@trading-os/shared';
import {
  detectMacdDivergence,
  macdDivergenceStrategy,
} from '../src/modules/strategies/builtin/macd-divergence.js';
import { insideBarNr7Strategy } from '../src/modules/strategies/builtin/inside-bar-nr7.js';
import { rescaleStrategyRiskReward, buildLongLevels } from '../src/modules/strategies/utils.js';
import { computeAllIndicators } from '../src/modules/indicators/index.js';
import type { Candle } from '@trading-os/shared';

function makeCandles(n: number): Candle[] {
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price += Math.sin(i / 8) * 3 + (i > n / 2 ? 0.15 : -0.05);
    out.push({
      openTime: i * 60_000,
      open: price - 0.4,
      high: price + 1.2,
      low: price - 1.2,
      close: price,
      volume: 800 + (i % 20) * 50,
      closeTime: i * 60_000 + 59_999,
    });
  }
  return out;
}

describe('detectMacdDivergence', () => {
  it('detects bullish hist divergence (price LL, hist HL)', () => {
    const n = 50;
    const closes = Array.from({ length: n }, (_, i) => 100 - i * 0.2);
    closes[20] = 90;
    closes[19] = 92;
    closes[21] = 92;
    closes[35] = 88;
    closes[34] = 90;
    closes[36] = 90;
    const hist = Array.from({ length: n }, () => -0.5);
    hist[20] = -1.2;
    hist[35] = -0.6;
    const div = detectMacdDivergence(closes, hist);
    expect(div?.kind).toBe('bullish');
  });
});

describe('macd_divergence / inside_bar_nr7 evaluate', () => {
  it('macd_divergence returns a result shape without throwing', () => {
    const candles = makeCandles(250);
    const indicators = computeAllIndicators(candles);
    const r = macdDivergenceStrategy.evaluate({
      symbol: 'TESTUSDT',
      timeframe: Timeframe.H1,
      candles,
      indicators,
      patterns: [],
    });
    expect(r.strategyId).toBe('macd_divergence');
    expect([Decision.BUY, Decision.SELL, Decision.NO_TRADE]).toContain(r.decision);
  });

  it('inside_bar_nr7 fires on inside-bar breakout', () => {
    const candles = makeCandles(40);
    const mother = candles[candles.length - 3]!;
    const pattern = candles[candles.length - 2]!;
    const breakout = candles[candles.length - 1]!;
    mother.high = 110;
    mother.low = 90;
    pattern.high = 105;
    pattern.low = 95;
    pattern.open = 100;
    pattern.close = 101;
    for (let i = candles.length - 8; i < candles.length - 2; i++) {
      candles[i]!.high = candles[i]!.close + 8;
      candles[i]!.low = candles[i]!.close - 8;
    }
    breakout.open = 104;
    breakout.close = 108;
    breakout.high = 109;
    breakout.low = 103;
    const indicators = computeAllIndicators(candles);
    const r = insideBarNr7Strategy.evaluate({
      symbol: 'TESTUSDT',
      timeframe: Timeframe.H1,
      candles,
      indicators,
      patterns: [],
    });
    expect(r.strategyId).toBe('inside_bar_nr7');
    expect(r.decision).toBe(Decision.BUY);
  });
});

describe('rescaleStrategyRiskReward', () => {
  it('sets TP to 1.2R from entry/SL', () => {
    const levels = buildLongLevels(100, 2, 1.5, 2);
    const rescaled = rescaleStrategyRiskReward(
      {
        strategyId: 'macd_divergence',
        decision: Decision.BUY,
        confidence: 70,
        ...levels,
        evidence: [],
      },
      1.2,
    );
    const risk = Math.abs(rescaled.entry! - rescaled.stopLoss!);
    expect(rescaled.takeProfit).toBeCloseTo(rescaled.entry! + risk * 1.2, 8);
    expect(rescaled.riskReward).toBe(1.2);
  });
});
