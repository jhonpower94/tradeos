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

export const liquiditySweepStrategy: Strategy = {
  id: ID,
  name: 'Liquidity Sweep Reversal',
  description: 'Fades stop-hunt wicks that sweep a prior swing level and close back inside range.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators, patterns } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);
    const lastIndex = candles.length - 1;

    // Only the current bar — prior-bar sweeps can re-break while we still fire.
    const hits = findPatterns(patterns, 'liquidity_sweep').filter((h) => h.index === lastIndex);
    if (hits.length === 0) {
      return noTrade(ID, [evidence(ID, 'No liquidity sweep on current bar')]);
    }

    const best = [...hits].sort((a, b) => b.confidence - a.confidence)[0]!;
    const level = best.price;
    if (level == null || !Number.isFinite(level)) {
      return noTrade(ID, [evidence(ID, 'Sweep missing level price')]);
    }

    // Re-verify close is still back inside the swept level.
    if (best.bullish) {
      if (!(last.low < level && last.close > level)) {
        return noTrade(ID, [evidence('sweep', 'Bullish sweep no longer closed back above level')]);
      }
    } else if (!(last.high > level && last.close < level)) {
      return noTrade(ID, [evidence('sweep', 'Bearish sweep no longer closed back below level')]);
    }

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
