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
} from '../utils.js';

const ID = 'pivot_bounce' as const;

export const pivotBounceStrategy: Strategy = {
  id: ID,
  name: 'Pivot Bounce',
  description: 'Mean-reversion bounces off classic daily pivot support/resistance levels.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const pivots = indicators.pivots;
    if (!pivots) {
      return noTrade(ID, [evidence(ID, 'No pivot levels available')]);
    }

    const atr = getAtr(indicators, last.close);
    const touchTol = atr * 0.35;
    const body = Math.abs(last.close - last.open) || 1e-9;
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const upperWick = last.high - Math.max(last.open, last.close);
    const bullishRejection = last.close > last.open && lowerWick > body * 0.4;
    const bearishRejection = last.close < last.open && upperWick > body * 0.4;

    for (const { level, label } of [
      { level: pivots.s1, label: 'S1' },
      { level: pivots.s2, label: 'S2' },
    ]) {
      const touched = last.low <= level + touchTol && last.close >= level - touchTol;
      if (touched && bullishRejection) {
        const proximity = 1 - Math.abs(last.close - level) / (atr || 1e-9);
        const levels = buildLongLevels(last.close, atr);
        const confidence = clamp(56 + proximity * 20 + (lowerWick / body) * 4, 0, 90);
        return {
          strategyId: ID,
          decision: Decision.BUY,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [
            evidence('pivots', `Bullish rejection at pivot ${label} (${level.toFixed(4)})`, 1),
          ],
        };
      }
    }

    for (const { level, label } of [
      { level: pivots.r1, label: 'R1' },
      { level: pivots.r2, label: 'R2' },
    ]) {
      const touched = last.high >= level - touchTol && last.close <= level + touchTol;
      if (touched && bearishRejection) {
        const proximity = 1 - Math.abs(last.close - level) / (atr || 1e-9);
        const levels = buildShortLevels(last.close, atr);
        const confidence = clamp(56 + proximity * 20 + (upperWick / body) * 4, 0, 90);
        return {
          strategyId: ID,
          decision: Decision.SELL,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [
            evidence('pivots', `Bearish rejection at pivot ${label} (${level.toFixed(4)})`, 1),
          ],
        };
      }
    }

    return noTrade(ID, [evidence('pivots', 'No qualifying pivot bounce')]);
  },
};
