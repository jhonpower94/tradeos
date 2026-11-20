import { Decision } from '@trading-os/shared';
import type { Strategy, StrategyContext } from '../types.js';
import {
  buildShortLevels,
  clamp,
  evidence,
  getAtr,
  isLargeImpulse,
  isStillNearExtreme,
  lastCandle,
  measureImpulse,
  noTrade,
} from '../utils.js';

const ID = 'impulse_reversal' as const;
const LOOKBACK = 40;

export const impulseReversalStrategy: Strategy = {
  id: ID,
  name: 'Impulse Reversal',
  description:
    'SELL-only: fades the start of a down move after a large up-impulse — short near a rally high.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const atr = getAtr(indicators, last.close);
    // Prior impulse excludes the signal candle so its wick does not redefine the extreme.
    const prior = candles.length > 1 ? candles.slice(0, -1) : candles;
    const impulse = measureImpulse(prior, LOOKBACK, atr);
    if (!impulse) {
      return noTrade(ID, [evidence(ID, 'Insufficient bars for impulse measure')]);
    }
    if (!isLargeImpulse(impulse, atr, last.close)) {
      return noTrade(ID, [
        evidence(
          ID,
          `Impulse too small (${impulse.rangePct.toFixed(1)}% / ${impulse.rangeAtr.toFixed(1)} ATR)`,
        ),
      ]);
    }

    const body = Math.abs(last.close - last.open) || 1e-9;
    const upperWick = last.high - Math.max(last.open, last.close);

    // SELL: large up-impulse, still near high, bearish rejection
    if (impulse.direction === 'up') {
      if (!isStillNearExtreme('sell', last.close, impulse.high, atr)) {
        return noTrade(ID, [
          evidence(ID, 'Already extended below rally high — late for SELL fade'),
        ]);
      }
      const bearishRejection = last.close < last.open && upperWick > body * 0.4;
      if (!bearishRejection) {
        return noTrade(ID, [evidence(ID, 'No bearish rejection after up-impulse')]);
      }
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(
        58 + impulse.rangeAtr * 2 + (upperWick / body) * 5,
        0,
        92,
      );
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            ID,
            `Early bearish fade after ${impulse.rangePct.toFixed(1)}% up-impulse near ${impulse.high.toFixed(4)}`,
            1,
          ),
        ],
      };
    }

    // Down-impulse / BUY fade intentionally disabled — SELL-only strategy.
    if (impulse.direction === 'down') {
      return noTrade(ID, [evidence(ID, 'BUY fade disabled — impulse_reversal is SELL-only')]);
    }

    return noTrade(ID, [evidence(ID, 'Flat impulse — no directional extreme')]);
  },
};
