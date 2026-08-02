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

const ID = 'order_block' as const;

function num(meta: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = meta?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export const orderBlockStrategy: Strategy = {
  id: ID,
  name: 'Order Block Mitigation',
  description: 'Enters when price returns to mitigate an unfilled bullish/bearish order block zone.',
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
      const overlaps = last.low <= high && last.high >= low;
      if (!overlaps) continue;

      const confidence = clamp(block.confidence + 5, 0, 90);
      if (block.bullish) {
        const levels = buildLongLevels(last.close, atr);
        return {
          strategyId: ID,
          decision: Decision.BUY,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [evidence('order_block', `Price mitigated bullish order block [${low.toFixed(4)}, ${high.toFixed(4)}]`, 1)],
        };
      }
      const levels = buildShortLevels(last.close, atr);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [evidence('order_block', `Price mitigated bearish order block [${low.toFixed(4)}, ${high.toFixed(4)}]`, 1)],
      };
    }

    return noTrade(ID, [evidence('order_block', 'Price has not returned to any order block zone')]);
  },
};
