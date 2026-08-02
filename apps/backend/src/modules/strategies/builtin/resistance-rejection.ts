import { Decision } from '@trading-os/shared';
import type { Strategy, StrategyContext } from '../types.js';
import {
  buildShortLevels,
  clamp,
  evidence,
  findPatterns,
  getAtr,
  lastCandle,
  noTrade,
} from '../utils.js';

const ID = 'resistance_rejection' as const;

export const resistanceRejectionStrategy: Strategy = {
  id: ID,
  name: 'Resistance Rejection',
  description: 'Sells bearish rejection candles that fail to break a detected resistance level.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators, patterns } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const resistances = findPatterns(patterns, 'resistance', false);
    if (resistances.length === 0) {
      return noTrade(ID, [evidence(ID, 'No resistance levels detected')]);
    }

    const atr = getAtr(indicators, last.close);
    const nearby = resistances
      .filter((r) => r.price != null && Math.abs(last.close - r.price) <= atr * 2.5)
      .sort((a, b) => Math.abs(last.close - a.price!) - Math.abs(last.close - b.price!))[0];
    if (!nearby || nearby.price == null) {
      return noTrade(ID, [evidence('resistance', 'No resistance level within range')]);
    }

    const touched = last.high >= nearby.price * 0.996;
    const body = Math.abs(last.close - last.open) || 1e-9;
    const upperWick = last.high - Math.max(last.open, last.close);
    const bearishRejection = last.close < last.open && upperWick > body * 0.4;

    if (!touched || !bearishRejection) {
      return noTrade(ID, [evidence('resistance', 'No qualifying rejection at resistance')]);
    }

    const levels = buildShortLevels(last.close, atr);
    const confidence = clamp(55 + (nearby.confidence ?? 60) * 0.3 + (upperWick / body) * 5, 0, 92);
    return {
      strategyId: ID,
      decision: Decision.SELL,
      confidence: Math.round(confidence),
      ...levels,
      evidence: [
        evidence('resistance', `Bearish rejection at resistance ${nearby.price.toFixed(4)}`, 1),
      ],
    };
  },
};
