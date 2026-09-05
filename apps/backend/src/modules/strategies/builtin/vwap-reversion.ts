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

const ID = 'vwap_reversion' as const;

export const vwapReversionStrategy: Strategy = {
  id: ID,
  name: 'VWAP Reversion',
  description:
    'Mean reversion when price wicks through VWAP and closes back across it (reclaim), not while still extended.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const vwap = seriesAt(indicators.vwap, 0);
    if (vwap == null || vwap <= 0) {
      return noTrade(ID, [evidence(ID, 'Insufficient VWAP data')]);
    }

    const atr = getAtr(indicators, last.close);
    const bullishCandle = last.close > last.open;
    const bearishCandle = last.close < last.open;
    const dippedBelow = last.low <= vwap * 0.995;
    const spikedAbove = last.high >= vwap * 1.005;
    const reclaimedAbove = last.close > vwap;
    const reclaimedBelow = last.close < vwap;
    const deviation = (last.close - vwap) / vwap;

    if (dippedBelow && reclaimedAbove && bullishCandle) {
      const levels = buildLongLevels(last.close, atr);
      const wickDepth = (vwap - last.low) / vwap;
      const confidence = clamp(58 + wickDepth * 1200, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            'vwap',
            `Wick below VWAP and close reclaim (+${(deviation * 100).toFixed(2)}%)`,
            1,
          ),
        ],
      };
    }

    if (spikedAbove && reclaimedBelow && bearishCandle) {
      const levels = buildShortLevels(last.close, atr);
      const wickDepth = (last.high - vwap) / vwap;
      const confidence = clamp(58 + wickDepth * 1200, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            'vwap',
            `Wick above VWAP and close reclaim (${(deviation * 100).toFixed(2)}%)`,
            1,
          ),
        ],
      };
    }

    return noTrade(ID, [
      evidence('vwap', `Deviation ${(deviation * 100).toFixed(2)}%, no VWAP reclaim`),
    ]);
  },
};
