import { Timeframe, type IndicatorSnapshot } from '@trading-os/shared';
import { lastValid } from '../indicators/index.js';

/** Map entry timeframe → parent HTF used for hard trend veto. */
export function resolveParentTimeframe(tf: string): Timeframe | null {
  switch (tf) {
    case Timeframe.M1:
    case Timeframe.M5:
    case Timeframe.M15:
      return Timeframe.H1;
    case Timeframe.M30:
    case Timeframe.H1:
      return Timeframe.H4;
    case Timeframe.H4:
      return Timeframe.D1;
    default:
      return null;
  }
}

export type HtfTrend = 'bull' | 'bear';

/** Classify HTF bias from EMA50 vs EMA200. */
export function detectHtfTrend(indicators: IndicatorSnapshot): HtfTrend | null {
  const ema50 = lastValid(indicators.ema50);
  const ema200 = lastValid(indicators.ema200);
  if (ema50 == null || ema200 == null) return null;
  return ema50 > ema200 ? 'bull' : 'bear';
}
