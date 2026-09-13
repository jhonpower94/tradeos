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

const ID = 'resistance_rejection_v2' as const;

export const resistanceRejectionV2: Strategy = {
  id: ID,
  name: 'Resistance Rejection v2',
  description: 'Tighter resistance rejection: requires a strong upper wick touch and quick failure to break.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators, patterns } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const resistances = findPatterns(patterns, 'resistance', false);
    if (resistances.length === 0) return noTrade(ID, [evidence(ID, 'No resistance levels detected')]);

    const atr = getAtr(indicators, last.close);
    const nearby = resistances
      .filter((r) => r.price != null && Math.abs(last.high - r.price) <= atr * 2)
      .sort((a, b) => Math.abs(last.high - a.price!) - Math.abs(last.high - b.price!))[0];
    if (!nearby || nearby.price == null) return noTrade(ID, [evidence('resistance', 'No nearby resistance')]);

    const touched = last.high >= nearby.price * 0.997; // touched or slightly pierced
    const body = Math.abs(last.close - last.open) || 1e-9;
    const upperWick = last.high - Math.max(last.open, last.close);
    const bearishRejection = last.close < last.open && upperWick > body * 0.6 && upperWick > atr * 0.2;

    // also ensure price did not close above resistance
    const closedAbove = last.close >= nearby.price * 1.001;
    if (!touched || !bearishRejection || closedAbove) {
      return noTrade(ID, [evidence('resistance', 'No strong rejection at resistance')]);
    }

    const levels = buildShortLevels(last.close, atr);
    const confidence = clamp(60 + (nearby.confidence ?? 60) * 0.35 + (upperWick / body) * 6, 0, 96);
    return {
      strategyId: ID,
      decision: Decision.SELL,
      confidence: Math.round(confidence),
      ...levels,
      evidence: [evidence('resistance', `Strong bearish rejection at ${nearby.price.toFixed(4)}`, 1)],
    };
  },
};
