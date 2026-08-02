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

const ID = 'change_of_character' as const;
const RECENCY_BARS = 2;

export const changeOfCharacterStrategy: Strategy = {
  id: ID,
  name: 'Change of Character',
  description: 'Trades early trend-reversal structure breaks (CHoCH) on the most recent bars.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators, patterns } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);
    const lastIndex = candles.length - 1;

    const hits = findPatterns(patterns, 'change_of_character').filter(
      (h) => h.index == null || lastIndex - h.index <= RECENCY_BARS,
    );
    if (hits.length === 0) {
      return noTrade(ID, [evidence(ID, 'No recent change of character')]);
    }

    const best = [...hits].sort((a, b) => b.confidence - a.confidence)[0]!;
    const atr = getAtr(indicators, last.close);
    // CHoCH is an early reversal signal — trade it a touch more conservatively than BOS.
    const confidence = clamp(best.confidence - 8, 0, 88);

    if (best.bullish) {
      const levels = buildLongLevels(last.close, atr);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [evidence('choch', 'Bullish change of character (early reversal)', 1)],
      };
    }

    const levels = buildShortLevels(last.close, atr);
    return {
      strategyId: ID,
      decision: Decision.SELL,
      confidence: Math.round(confidence),
      ...levels,
      evidence: [evidence('choch', 'Bearish change of character (early reversal)', 1)],
    };
  },
};
