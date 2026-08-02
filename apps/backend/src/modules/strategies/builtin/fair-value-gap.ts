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

const ID = 'fair_value_gap' as const;

function num(meta: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = meta?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export const fairValueGapStrategy: Strategy = {
  id: ID,
  name: 'Fair Value Gap Fill',
  description: 'Enters when price retraces back into an unfilled fair value gap (imbalance).',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators, patterns } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const gaps = findPatterns(patterns, 'fair_value_gap');
    if (gaps.length === 0) {
      return noTrade(ID, [evidence(ID, 'No fair value gaps detected')]);
    }

    const atr = getAtr(indicators, last.close);

    for (const gap of gaps) {
      const gapHigh = num(gap.meta, 'gapHigh');
      const gapLow = num(gap.meta, 'gapLow');
      if (gapHigh == null || gapLow == null) continue;
      const overlaps = last.low <= gapHigh && last.high >= gapLow;
      if (!overlaps) continue;

      const confidence = clamp(gap.confidence + 5, 0, 88);
      if (gap.bullish) {
        const levels = buildLongLevels(last.close, atr);
        return {
          strategyId: ID,
          decision: Decision.BUY,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [evidence('fvg', `Price filled bullish FVG [${gapLow.toFixed(4)}, ${gapHigh.toFixed(4)}]`, 1)],
        };
      }
      const levels = buildShortLevels(last.close, atr);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [evidence('fvg', `Price filled bearish FVG [${gapLow.toFixed(4)}, ${gapHigh.toFixed(4)}]`, 1)],
      };
    }

    return noTrade(ID, [evidence('fvg', 'Price has not returned into any fair value gap')]);
  },
};
