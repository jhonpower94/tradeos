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

const ID = 'bollinger_reversal' as const;

export const bollingerReversalStrategy: Strategy = {
  id: ID,
  name: 'Bollinger Band Reversal',
  description: 'Mean-reversion trades when price wicks outside the bands and closes back inside.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const upper = seriesAt(indicators.bollinger?.upper, 0);
    const lower = seriesAt(indicators.bollinger?.lower, 0);
    const middle = seriesAt(indicators.bollinger?.middle, 0);
    if (upper == null || lower == null || middle == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient Bollinger data')]);
    }

    const bandWidth = upper - lower || 1e-9;
    const atr = getAtr(indicators, last.close);

    const touchedLower = last.low <= lower && last.close > lower;
    const touchedUpper = last.high >= upper && last.close < upper;

    if (touchedLower) {
      const overshoot = (lower - last.low) / bandWidth;
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(58 + overshoot * 400, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [evidence('bollinger', 'Wicked below lower band and closed back inside', 1)],
      };
    }

    if (touchedUpper) {
      const overshoot = (last.high - upper) / bandWidth;
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(58 + overshoot * 400, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [evidence('bollinger', 'Wicked above upper band and closed back inside', 1)],
      };
    }

    return noTrade(ID, [evidence('bollinger', 'Price within bands, no reversal signal')]);
  },
};
