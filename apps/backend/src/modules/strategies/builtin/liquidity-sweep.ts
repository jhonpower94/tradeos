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

const ID = 'liquidity_sweep' as const;
const RECENCY_BARS = 1;

export const liquiditySweepStrategy: Strategy = {
  id: ID,
  name: 'Liquidity Sweep Reversal',
  description: 'Fades stop-hunt wicks that sweep a prior swing level and close back inside range.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators, patterns } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);
    const lastIndex = candles.length - 1;

    const hits = findPatterns(patterns, 'liquidity_sweep').filter(
      (h) => h.index == null || lastIndex - h.index <= RECENCY_BARS,
    );
    if (hits.length === 0) {
      return noTrade(ID, [evidence(ID, 'No recent liquidity sweep')]);
    }

    const best = [...hits].sort((a, b) => b.confidence - a.confidence)[0]!;
    const atr = getAtr(indicators, last.close);
    const confidence = clamp(best.confidence, 0, 90);

    if (best.bullish) {
      const levels = buildLongLevels(last.close, atr);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [evidence('sweep', 'Bullish reversal after sell-side liquidity sweep', 1)],
      };
    }

    const levels = buildShortLevels(last.close, atr);
    return {
      strategyId: ID,
      decision: Decision.SELL,
      confidence: Math.round(confidence),
      ...levels,
      evidence: [evidence('sweep', 'Bearish reversal after buy-side liquidity sweep', 1)],
    };
  },
};
