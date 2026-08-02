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

const ID = 'bb_squeeze_breakout' as const;
const COMPRESSION_PCT = 2.5;
const LOOKBACK = 5;

function bbWidthPctAt(
  upper: number[] | undefined,
  lower: number[] | undefined,
  middle: number[] | undefined,
  back: number,
): number | undefined {
  const u = seriesAt(upper, back);
  const l = seriesAt(lower, back);
  const m = seriesAt(middle, back);
  if (u == null || l == null || m == null || m === 0) return undefined;
  return ((u - l) / m) * 100;
}

export const bbSqueezeBreakoutStrategy: Strategy = {
  id: ID,
  name: 'BB Squeeze Breakout',
  description:
    'Trades breakouts after Bollinger Band compression: prior squeeze then expansion beyond a band.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const upper = indicators.bollinger?.upper;
    const lower = indicators.bollinger?.lower;
    const middle = indicators.bollinger?.middle;
    const widthNow = bbWidthPctAt(upper, lower, middle, 0);
    const widthPrev = bbWidthPctAt(upper, lower, middle, 1);
    const bandUpper = seriesAt(upper, 0);
    const bandLower = seriesAt(lower, 0);
    if (widthNow == null || widthPrev == null || bandUpper == null || bandLower == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient Bollinger data')]);
    }

    let hadSqueeze = false;
    for (let back = 1; back <= LOOKBACK; back++) {
      const w = bbWidthPctAt(upper, lower, middle, back);
      if (w != null && w <= COMPRESSION_PCT) {
        hadSqueeze = true;
        break;
      }
    }
    if (!hadSqueeze) {
      return noTrade(ID, [evidence('bollinger', 'No recent BB compression')]);
    }

    if (!(widthNow > widthPrev)) {
      return noTrade(ID, [evidence('bollinger', 'Bands not expanding after squeeze')]);
    }

    const atr = getAtr(indicators, last.close);

    if (last.close > bandUpper) {
      const overshoot = (last.close - bandUpper) / (bandUpper || 1e-9);
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(60 + overshoot * 2000 + (widthNow - widthPrev) * 5, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('bollinger', 'Squeeze then close above upper band', 1),
          evidence('bollinger', `BB width ${widthPrev.toFixed(2)}% → ${widthNow.toFixed(2)}%`, 0.5),
        ],
      };
    }

    if (last.close < bandLower) {
      const overshoot = (bandLower - last.close) / (bandLower || 1e-9);
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(60 + overshoot * 2000 + (widthNow - widthPrev) * 5, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('bollinger', 'Squeeze then close below lower band', 1),
          evidence('bollinger', `BB width ${widthPrev.toFixed(2)}% → ${widthNow.toFixed(2)}%`, 0.5),
        ],
      };
    }

    return noTrade(ID, [evidence('bollinger', 'Squeeze present but no band breakout')]);
  },
};
