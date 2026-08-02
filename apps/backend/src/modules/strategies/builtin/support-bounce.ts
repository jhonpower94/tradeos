import { Decision } from '@trading-os/shared';
import type { Strategy, StrategyContext } from '../types.js';
import {
  buildLongLevels,
  clamp,
  evidence,
  findPatterns,
  getAtr,
  lastCandle,
  noTrade,
} from '../utils.js';

const ID = 'support_bounce' as const;

export const supportBounceStrategy: Strategy = {
  id: ID,
  name: 'Support Bounce',
  description: 'Buys bullish rejection candles that bounce off a detected support level.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators, patterns } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const supports = findPatterns(patterns, 'support', true);
    if (supports.length === 0) {
      return noTrade(ID, [evidence(ID, 'No support levels detected')]);
    }

    const atr = getAtr(indicators, last.close);
    const nearby = supports
      .filter((s) => s.price != null && Math.abs(last.close - s.price) <= atr * 2.5)
      .sort((a, b) => Math.abs(last.close - a.price!) - Math.abs(last.close - b.price!))[0];
    if (!nearby || nearby.price == null) {
      return noTrade(ID, [evidence('support', 'No support level within range')]);
    }

    const touched = last.low <= nearby.price * 1.004;
    const body = Math.abs(last.close - last.open) || 1e-9;
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const bullishRejection = last.close > last.open && lowerWick > body * 0.4;

    if (!touched || !bullishRejection) {
      return noTrade(ID, [evidence('support', 'No qualifying bounce at support')]);
    }

    const levels = buildLongLevels(last.close, atr);
    const confidence = clamp(55 + (nearby.confidence ?? 60) * 0.3 + (lowerWick / body) * 5, 0, 92);
    return {
      strategyId: ID,
      decision: Decision.BUY,
      confidence: Math.round(confidence),
      ...levels,
      evidence: [
        evidence('support', `Bullish rejection at support ${nearby.price.toFixed(4)}`, 1),
      ],
    };
  },
};
