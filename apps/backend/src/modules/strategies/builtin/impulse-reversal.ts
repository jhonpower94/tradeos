import { Decision } from '@trading-os/shared';
import type { Strategy, StrategyContext } from '../types.js';
import {
  buildLongLevels,
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
/** Float slack so tag checks survive IEEE noise (e.g. 111.55 vs 111.55000000000001). */
const TAG_EPS = 1e-9;

export const impulseReversalStrategy: Strategy = {
  id: ID,
  name: 'Impulse Reversal',
  description:
    'Fades the start of a reversal after a large opposing impulse — short near a rally high, long near a selloff low. Filter side on Scanner if you want one direction only.',
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
    const lowerWick = Math.min(last.open, last.close) - last.low;

    // SELL: large up-impulse, tag-and-reject back below high, still near extreme
    if (impulse.direction === 'up') {
      const taggedHigh = last.high + TAG_EPS >= impulse.high;
      const closedBackBelow = last.close < impulse.high - TAG_EPS;
      const bearishRejection =
        taggedHigh &&
        closedBackBelow &&
        last.close < last.open &&
        upperWick > body * 0.4;
      if (!bearishRejection) {
        return noTrade(ID, [
          evidence(
            ID,
            !taggedHigh
              ? 'Did not tag rally high — no SELL fade'
              : !closedBackBelow
                ? 'Closed at/above rally high — continuation, not fade'
                : 'No bearish rejection after up-impulse',
          ),
        ]);
      }
      if (!isStillNearExtreme('sell', last.close, impulse.high, atr)) {
        return noTrade(ID, [
          evidence(ID, 'Already extended below rally high — late for SELL fade'),
        ]);
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

    // BUY: large down-impulse, tag-and-reject back above low, still near extreme
    if (impulse.direction === 'down') {
      const taggedLow = last.low - TAG_EPS <= impulse.low;
      const closedBackAbove = last.close > impulse.low + TAG_EPS;
      const bullishRejection =
        taggedLow &&
        closedBackAbove &&
        last.close > last.open &&
        lowerWick > body * 0.4;
      if (!bullishRejection) {
        return noTrade(ID, [
          evidence(
            ID,
            !taggedLow
              ? 'Did not tag selloff low — no BUY fade'
              : !closedBackAbove
                ? 'Closed at/below selloff low — continuation, not fade'
                : 'No bullish rejection after down-impulse',
          ),
        ]);
      }
      if (!isStillNearExtreme('buy', last.close, impulse.low, atr)) {
        return noTrade(ID, [
          evidence(ID, 'Already extended above selloff low — late for BUY fade'),
        ]);
      }
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(
        58 + impulse.rangeAtr * 2 + (lowerWick / body) * 5,
        0,
        92,
      );
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            ID,
            `Early bullish fade after ${impulse.rangePct.toFixed(1)}% down-impulse near ${impulse.low.toFixed(4)}`,
            1,
          ),
        ],
      };
    }

    return noTrade(ID, [evidence(ID, 'Flat impulse — no directional extreme')]);
  },
};
