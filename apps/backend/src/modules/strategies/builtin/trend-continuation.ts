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

const ID = 'trend_continuation' as const;

export const trendContinuationStrategy: Strategy = {
  id: ID,
  name: 'Trend Continuation',
  description: 'Fully stacked EMAs with strong ADX and a shallow pullback candle continuing the trend.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const ema9 = seriesAt(indicators.ema9);
    const ema21 = seriesAt(indicators.ema21);
    const ema50 = seriesAt(indicators.ema50);
    const ema200 = seriesAt(indicators.ema200);
    const adx = seriesAt(indicators.adx14?.adx);
    if (ema9 == null || ema21 == null || ema50 == null || ema200 == null || adx == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient EMA/ADX data')]);
    }

    const bullStack = ema9 > ema21 && ema21 > ema50 && ema50 > ema200;
    const bearStack = ema9 < ema21 && ema21 < ema50 && ema50 < ema200;
    const strongTrend = adx > 22;
    const atr = getAtr(indicators, last.close);

    if (bullStack && strongTrend) {
      const shallowPullback = last.low <= ema9 * 1.004 || last.low <= ema21 * 1.004;
      if (shallowPullback && last.close > last.open) {
        const levels = buildLongLevels(last.close, atr);
        const confidence = clamp(65 + (adx - 22) * 1.2, 0, 93);
        return {
          strategyId: ID,
          decision: Decision.BUY,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [
            evidence('ema_stack', 'EMA9>EMA21>EMA50>EMA200 fully bullish stacked', 1),
            evidence('adx', `ADX=${adx.toFixed(1)} confirms trend strength`, 0.5),
          ],
        };
      }
    }

    if (bearStack && strongTrend) {
      const shallowPullback = last.high >= ema9 * 0.996 || last.high >= ema21 * 0.996;
      if (shallowPullback && last.close < last.open) {
        const levels = buildShortLevels(last.close, atr);
        const confidence = clamp(65 + (adx - 22) * 1.2, 0, 93);
        return {
          strategyId: ID,
          decision: Decision.SELL,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [
            evidence('ema_stack', 'EMA9<EMA21<EMA50<EMA200 fully bearish stacked', 1),
            evidence('adx', `ADX=${adx.toFixed(1)} confirms trend strength`, 0.5),
          ],
        };
      }
    }

    return noTrade(ID, [evidence('trend_continuation', 'No fully stacked trend with valid pullback')]);
  },
};
