import { Decision } from '@trading-os/shared';
import type { Strategy, StrategyContext } from '../types.js';
import {
  buildLongLevels,
  buildShortLevels,
  clamp,
  evidence,
  findPatterns,
  getAtr,
  isDemandZoneReclaim,
  isSupplyZoneReclaim,
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
  description:
    'Enters after price retraces into an FVG and reclaims the gap edge (rejection), not on raw overlap.',
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

      if (gap.bullish) {
        if (!isDemandZoneReclaim(last, gapLow, gapHigh)) continue;
        const levels = buildLongLevels(last.close, atr);
        const confidence = clamp(gap.confidence + 5, 0, 88);
        return {
          strategyId: ID,
          decision: Decision.BUY,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [
            evidence(
              'fvg',
              `Reclaimed bullish FVG [${gapLow.toFixed(4)}, ${gapHigh.toFixed(4)}]`,
              1,
            ),
          ],
        };
      }

      if (!isSupplyZoneReclaim(last, gapLow, gapHigh)) continue;
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(gap.confidence + 5, 0, 88);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            'fvg',
            `Reclaimed bearish FVG [${gapLow.toFixed(4)}, ${gapHigh.toFixed(4)}]`,
            1,
          ),
        ],
      };
    }

    return noTrade(ID, [evidence('fvg', 'No reclaim/rejection at any fair value gap')]);
  },
};
