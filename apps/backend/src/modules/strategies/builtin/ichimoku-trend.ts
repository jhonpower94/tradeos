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

const ID = 'ichimoku_trend' as const;

export const ichimokuTrendStrategy: Strategy = {
  id: ID,
  name: 'Ichimoku Cloud Trend',
  description:
    'Trend trades when price is on the correct side of the cloud with Tenkan/Kijun alignment.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const tenkan = seriesAt(indicators.ichimoku?.tenkan, 0);
    const kijun = seriesAt(indicators.ichimoku?.kijun, 0);
    const senkouA = seriesAt(indicators.ichimoku?.senkouA, 0);
    const senkouB = seriesAt(indicators.ichimoku?.senkouB, 0);
    const tenkanPrev = seriesAt(indicators.ichimoku?.tenkan, 1);
    const kijunPrev = seriesAt(indicators.ichimoku?.kijun, 1);
    if (tenkan == null || kijun == null || senkouA == null || senkouB == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient Ichimoku data')]);
    }

    const cloudTop = Math.max(senkouA, senkouB);
    const cloudBottom = Math.min(senkouA, senkouB);
    const atr = getAtr(indicators, last.close);
    const freshTkBull =
      tenkanPrev != null && kijunPrev != null && tenkanPrev <= kijunPrev && tenkan > kijun;
    const freshTkBear =
      tenkanPrev != null && kijunPrev != null && tenkanPrev >= kijunPrev && tenkan < kijun;

    if (last.close > cloudTop && tenkan > kijun) {
      const cloudClearance = (last.close - cloudTop) / (atr || 1e-9);
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(58 + cloudClearance * 4 + (freshTkBull ? 12 : 0), 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('ichimoku', 'Price above cloud with Tenkan > Kijun', 1),
          ...(freshTkBull ? [evidence('ichimoku', 'Fresh Tenkan/Kijun bullish cross', 0.5)] : []),
        ],
      };
    }

    if (last.close < cloudBottom && tenkan < kijun) {
      const cloudClearance = (cloudBottom - last.close) / (atr || 1e-9);
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(58 + cloudClearance * 4 + (freshTkBear ? 12 : 0), 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('ichimoku', 'Price below cloud with Tenkan < Kijun', 1),
          ...(freshTkBear ? [evidence('ichimoku', 'Fresh Tenkan/Kijun bearish cross', 0.5)] : []),
        ],
      };
    }

    return noTrade(ID, [evidence('ichimoku', 'No Ichimoku trend alignment')]);
  },
};
