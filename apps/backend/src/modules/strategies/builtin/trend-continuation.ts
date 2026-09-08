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

/** Aligns with regime trending threshold (ADX ≥ 25). */
export const TREND_CONTINUATION_ADX_MIN = 25;
/** Max close distance from EMA21 in ATR units — reject chase entries. */
export const TREND_CONTINUATION_MAX_EXTENSION_ATR = 1;
/** EMA21 touch band (±0.3%), same idea as ema_pullback. */
const EMA21_TOUCH_FRAC = 0.003;

export const trendContinuationStrategy: Strategy = {
  id: ID,
  name: 'Trend Continuation',
  description:
    'Fully stacked EMAs with ADX≥25 (rising), an EMA21 pullback reclaim, and no overextended close.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const ema9 = seriesAt(indicators.ema9);
    const ema21 = seriesAt(indicators.ema21);
    const ema50 = seriesAt(indicators.ema50);
    const ema200 = seriesAt(indicators.ema200);
    const adx = seriesAt(indicators.adx14?.adx);
    const adxPrev = seriesAt(indicators.adx14?.adx, 1);
    if (ema9 == null || ema21 == null || ema50 == null || ema200 == null || adx == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient EMA/ADX data')]);
    }

    const bullStack = ema9 > ema21 && ema21 > ema50 && ema50 > ema200;
    const bearStack = ema9 < ema21 && ema21 < ema50 && ema50 < ema200;
    const strongTrend = adx >= TREND_CONTINUATION_ADX_MIN;
    const risingAdx = adxPrev == null || adx >= adxPrev;
    const atr = getAtr(indicators, last.close);

    const touchedEma21 =
      last.low <= ema21 * (1 + EMA21_TOUCH_FRAC) && last.high >= ema21 * (1 - EMA21_TOUCH_FRAC);

    if (bullStack && strongTrend && risingAdx) {
      const reclaimed = last.close > ema21 && last.close > last.open;
      const extensionAtr = (last.close - ema21) / atr;
      const notOverextended = extensionAtr <= TREND_CONTINUATION_MAX_EXTENSION_ATR;
      if (touchedEma21 && reclaimed && notOverextended) {
        const levels = buildLongLevels(last.close, atr);
        const confidence = clamp(
          68 + (adx - TREND_CONTINUATION_ADX_MIN) * 1.5 + (adxPrev != null && adx > adxPrev ? 4 : 0),
          0,
          93,
        );
        return {
          strategyId: ID,
          decision: Decision.BUY,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [
            evidence('ema_stack', 'EMA9>EMA21>EMA50>EMA200 fully bullish stacked', 1),
            evidence('adx', `ADX=${adx.toFixed(1)} (≥${TREND_CONTINUATION_ADX_MIN}, rising)`, 0.5),
            evidence('pullback', 'EMA21 touch + bullish reclaim, not overextended', 1),
          ],
        };
      }
    }

    if (bearStack && strongTrend && risingAdx) {
      const reclaimed = last.close < ema21 && last.close < last.open;
      const extensionAtr = (ema21 - last.close) / atr;
      const notOverextended = extensionAtr <= TREND_CONTINUATION_MAX_EXTENSION_ATR;
      if (touchedEma21 && reclaimed && notOverextended) {
        const levels = buildShortLevels(last.close, atr);
        const confidence = clamp(
          68 + (adx - TREND_CONTINUATION_ADX_MIN) * 1.5 + (adxPrev != null && adx > adxPrev ? 4 : 0),
          0,
          93,
        );
        return {
          strategyId: ID,
          decision: Decision.SELL,
          confidence: Math.round(confidence),
          ...levels,
          evidence: [
            evidence('ema_stack', 'EMA9<EMA21<EMA50<EMA200 fully bearish stacked', 1),
            evidence('adx', `ADX=${adx.toFixed(1)} (≥${TREND_CONTINUATION_ADX_MIN}, rising)`, 0.5),
            evidence('pullback', 'EMA21 touch + bearish reclaim, not overextended', 1),
          ],
        };
      }
    }

    return noTrade(ID, [evidence('trend_continuation', 'No fully stacked trend with valid EMA21 pullback')]);
  },
};
