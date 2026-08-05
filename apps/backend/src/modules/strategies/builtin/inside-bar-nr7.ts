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
  candleAt,
} from '../utils.js';

const ID = 'inside_bar_nr7' as const;
const NR_LOOKBACK = 7;

export const insideBarNr7Strategy: Strategy = {
  id: ID,
  name: 'Inside Bar / NR7',
  description:
    'Trades break of a compression bar: inside bar and/or narrowest range of last 7 bars (NR7).',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const breakout = lastCandle(candles);
    const pattern = candleAt(candles, 1);
    const mother = candleAt(candles, 2);
    if (!breakout || !pattern || !mother || candles.length < NR_LOOKBACK + 3) {
      return noTrade(ID);
    }

    const patternRange = pattern.high - pattern.low;
    if (!(patternRange > 0)) {
      return noTrade(ID, [evidence(ID, 'Invalid pattern bar range')]);
    }

    const isInside = pattern.high < mother.high && pattern.low > mother.low;

    // NR7: pattern is the narrowest of the 7 bars ending at the pattern bar
    let isNr7 = true;
    for (let back = 2; back <= NR_LOOKBACK; back++) {
      const c = candleAt(candles, back);
      if (!c) {
        isNr7 = false;
        break;
      }
      if (c.high - c.low < patternRange) {
        isNr7 = false;
        break;
      }
    }

    if (!isInside && !isNr7) {
      return noTrade(ID, [evidence('range', 'No inside bar or NR7 pattern')]);
    }

    const atr = getAtr(indicators, breakout.close);
    const brokeHigh = breakout.close > pattern.high && breakout.close > breakout.open;
    const brokeLow = breakout.close < pattern.low && breakout.close < breakout.open;

    const label = [isInside ? 'inside' : null, isNr7 ? 'NR7' : null].filter(Boolean).join('/');

    if (brokeHigh) {
      const levels = buildLongLevels(breakout.close, atr);
      const confidence = clamp(60 + (isInside && isNr7 ? 12 : 6), 0, 90);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence,
        ...levels,
        evidence: [evidence('pattern', `Break above ${label} bar high`, 1)],
      };
    }

    if (brokeLow) {
      const levels = buildShortLevels(breakout.close, atr);
      const confidence = clamp(60 + (isInside && isNr7 ? 12 : 6), 0, 90);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence,
        ...levels,
        evidence: [evidence('pattern', `Break below ${label} bar low`, 1)],
      };
    }

    return noTrade(ID, [evidence('pattern', 'Compression bar present but no break yet')]);
  },
};
