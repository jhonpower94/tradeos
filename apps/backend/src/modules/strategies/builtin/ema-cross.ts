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

const ID = 'ema_cross' as const;

export const emaCrossStrategy: Strategy = {
  id: ID,
  name: 'EMA Cross',
  description: 'Golden/death cross of EMA9 over EMA21.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const ema9Now = seriesAt(indicators.ema9, 0);
    const ema9Prev = seriesAt(indicators.ema9, 1);
    const ema21Now = seriesAt(indicators.ema21, 0);
    const ema21Prev = seriesAt(indicators.ema21, 1);
    if (ema9Now == null || ema9Prev == null || ema21Now == null || ema21Prev == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient EMA data')]);
    }

    const atr = getAtr(indicators, last.close);
    const crossedUp = ema9Prev <= ema21Prev && ema9Now > ema21Now;
    const crossedDown = ema9Prev >= ema21Prev && ema9Now < ema21Now;
    const separationPct = Math.abs(ema9Now - ema21Now) / last.close;

    if (crossedUp) {
      const levels = buildLongLevels(last.close, atr);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(clamp(65 + separationPct * 2000, 0, 92)),
        ...levels,
        evidence: [evidence('ema_cross', 'EMA9 crossed above EMA21 (golden cross)', 1)],
      };
    }
    if (crossedDown) {
      const levels = buildShortLevels(last.close, atr);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(clamp(65 + separationPct * 2000, 0, 92)),
        ...levels,
        evidence: [evidence('ema_cross', 'EMA9 crossed below EMA21 (death cross)', 1)],
      };
    }
    return noTrade(ID, [evidence('ema_cross', 'No fresh EMA9/EMA21 crossover')]);
  },
};
