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

const ID = 'atr_trend' as const;

export const atrTrendStrategy: Strategy = {
  id: ID,
  name: 'ATR Trend Expansion',
  description: 'Trades directional moves confirmed by expanding ATR volatility and ADX strength.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const atrNow = seriesAt(indicators.atr14, 0);
    const atrPrev = seriesAt(indicators.atr14, 3);
    const adx = seriesAt(indicators.adx14?.adx, 0);
    const plusDI = seriesAt(indicators.adx14?.plusDI, 0);
    const minusDI = seriesAt(indicators.adx14?.minusDI, 0);
    const ema50 = seriesAt(indicators.ema50, 0);

    if (atrNow == null || atrPrev == null || adx == null || plusDI == null || minusDI == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient ATR/ADX data')]);
    }

    const expanding = atrNow > atrPrev * 1.05;
    const strongTrend = adx > 20;
    const bullishDirection = plusDI > minusDI && (ema50 == null || last.close > ema50);
    const bearishDirection = minusDI > plusDI && (ema50 == null || last.close < ema50);

    if (!expanding || !strongTrend) {
      return noTrade(ID, [evidence('atr', 'Volatility not expanding or trend too weak')]);
    }

    const atr = getAtr(indicators, last.close);
    if (bullishDirection) {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(58 + (adx - 20) * 1.2 + ((atrNow / atrPrev - 1) * 100), 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('adx', `ADX=${adx.toFixed(1)}, +DI>-DI`, 1),
          evidence('atr', 'ATR expanding, volatility supports continuation', 0.5),
        ],
      };
    }

    if (bearishDirection) {
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(58 + (adx - 20) * 1.2 + ((atrNow / atrPrev - 1) * 100), 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('adx', `ADX=${adx.toFixed(1)}, -DI>+DI`, 1),
          evidence('atr', 'ATR expanding, volatility supports continuation', 0.5),
        ],
      };
    }

    return noTrade(ID, [evidence('atr_trend', 'No clear directional bias')]);
  },
};
