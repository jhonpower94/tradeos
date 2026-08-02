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

const ID = 'rsi_pullback' as const;

export const rsiPullbackStrategy: Strategy = {
  id: ID,
  name: 'RSI Pullback',
  description: 'RSI recovering from oversold / rejecting from overbought, aligned with trend.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const rsiNow = seriesAt(indicators.rsi14, 0);
    const rsiPrev = seriesAt(indicators.rsi14, 1);
    if (rsiNow == null || rsiPrev == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient RSI data')]);
    }

    const ema50 = seriesAt(indicators.ema50);
    const ema200 = seriesAt(indicators.ema200);
    const trendUp = ema50 != null && ema200 != null ? ema50 > ema200 : true;
    const trendDown = ema50 != null && ema200 != null ? ema50 < ema200 : true;

    const atr = getAtr(indicators, last.close);
    const oversoldRecovery = rsiPrev <= 32 && rsiNow > 32;
    const overboughtRejection = rsiPrev >= 68 && rsiNow < 68;

    if (trendUp && oversoldRecovery) {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(58 + (32 - rsiPrev) * 1.5 + (rsiNow - rsiPrev) * 2, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('rsi', `RSI recovered from oversold (${rsiPrev.toFixed(1)} -> ${rsiNow.toFixed(1)})`, 1),
        ],
      };
    }

    if (trendDown && overboughtRejection) {
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(58 + (rsiPrev - 68) * 1.5 + (rsiPrev - rsiNow) * 2, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('rsi', `RSI rejected from overbought (${rsiPrev.toFixed(1)} -> ${rsiNow.toFixed(1)})`, 1),
        ],
      };
    }

    return noTrade(ID, [evidence('rsi', `RSI=${rsiNow.toFixed(1)}, no qualifying pullback`)]);
  },
};
