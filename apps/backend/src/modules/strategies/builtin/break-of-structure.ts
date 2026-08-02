import { Decision } from '@trading-os/shared';
import type { Strategy, StrategyContext } from '../types.js';
import {
  buildLongLevels,
  buildShortLevels,
  clamp,
  evidence,
  findPatterns,
  getAtr,
  lastCandle,
  noTrade,
} from '../utils.js';

const ID = 'break_of_structure' as const;
const RECENCY_BARS = 2;

export const breakOfStructureStrategy: Strategy = {
  id: ID,
  name: 'Break of Structure',
  description: 'Trades trend-continuation structure breaks (BOS) detected on the most recent bars.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators, patterns } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);
    const lastIndex = candles.length - 1;

    const hits = findPatterns(patterns, 'break_of_structure').filter(
      (h) => h.index == null || lastIndex - h.index <= RECENCY_BARS,
    );
    if (hits.length === 0) {
      return noTrade(ID, [evidence(ID, 'No recent break of structure')]);
    }

    const best = [...hits].sort((a, b) => b.confidence - a.confidence)[0]!;
    const atr = getAtr(indicators, last.close);
    const confidence = clamp(best.confidence, 0, 92);

    if (best.bullish) {
      const levels = buildLongLevels(last.close, atr);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [evidence('bos', 'Bullish break of structure confirmed', 1)],
      };
    }

    const levels = buildShortLevels(last.close, atr);
    return {
      strategyId: ID,
      decision: Decision.SELL,
      confidence: Math.round(confidence),
      ...levels,
      evidence: [evidence('bos', 'Bearish break of structure confirmed', 1)],
    };
  },
};
