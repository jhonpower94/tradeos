import { Decision } from '@trading-os/shared';
import type { Strategy, StrategyContext } from '../types.js';
import {
  buildLongLevels,
  buildShortLevels,
  clamp,
  evidence,
  getAtr,
  lastCandle,
  noTrade,
  seriesAt,
} from '../utils.js';

const ID = 'supertrend' as const;

export const supertrendStrategy: Strategy = {
  id: ID,
  name: 'Supertrend',
  description: 'Follows the Supertrend indicator direction, weighting fresh flips highest.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const dirNow = seriesAt(indicators.supertrend?.direction, 0);
    const dirPrev = seriesAt(indicators.supertrend?.direction, 1);
    const valueNow = seriesAt(indicators.supertrend?.value, 0);
    if (dirNow == null || valueNow == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient Supertrend data')]);
    }

    const atr = getAtr(indicators, last.close);
    const freshFlip = dirPrev != null && dirPrev !== dirNow;
    const distancePct = Math.abs(last.close - valueNow) / atr;

    if (dirNow > 0) {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp((freshFlip ? 75 : 55) + distancePct * 3, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('supertrend', freshFlip ? 'Supertrend flipped bullish' : 'Supertrend bullish', 1),
        ],
      };
    }

    if (dirNow < 0) {
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp((freshFlip ? 75 : 55) + distancePct * 3, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('supertrend', freshFlip ? 'Supertrend flipped bearish' : 'Supertrend bearish', 1),
        ],
      };
    }

    return noTrade(ID, [evidence('supertrend', 'No directional signal')]);
  },
};
