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

const ID = 'order_block' as const;

function num(meta: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = meta?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export const orderBlockStrategy: Strategy = {
  id: ID,
  name: 'Order Block Mitigation',
  description:
    'Enters after price returns to an order block zone and reclaims it (rejection), not on raw overlap.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators, patterns } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const blocks = findPatterns(patterns, 'order_block');
    if (blocks.length === 0) {
      return noTrade(ID, [evidence(ID, 'No order blocks detected')]);
    }

    const atr = getAtr(indicators, last.close);

    for (const block of blocks) {
      const high = num(block.meta, 'high');
      const low = num(block.meta, 'low');
      if (high == null || low == null) continue;

      if (block.bullish) {
        if (!isDemandZoneReclaim(last, low, high)) continue;
        const levels = buildLongLevels(last.close, atr);
        const confidence = clamp(block.confidence + 5, 0, 90);
        return {
          strategyId: ID,
          decision: Decision.BUY,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [
            evidence(
              'order_block',
              `Reclaimed bullish order block [${low.toFixed(4)}, ${high.toFixed(4)}]`,
              1,
            ),
          ],
        };
      }

      if (!isSupplyZoneReclaim(last, low, high)) continue;
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(block.confidence + 5, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            'order_block',
            `Reclaimed bearish order block [${low.toFixed(4)}, ${high.toFixed(4)}]`,
            1,
          ),
        ],
      };
    }

    return noTrade(ID, [
      evidence('order_block', 'No reclaim/rejection at any order block zone'),
    ]);
  },
};
