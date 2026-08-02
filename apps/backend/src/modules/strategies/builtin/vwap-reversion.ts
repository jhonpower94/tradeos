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
  description: 'Mean reversion trades when price stretches away from VWAP and snaps back.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const vwap = seriesAt(indicators.vwap, 0);
    if (vwap == null || vwap <= 0) {
      return noTrade(ID, [evidence(ID, 'Insufficient VWAP data')]);
    }

    const deviation = (last.close - vwap) / vwap;
    const atr = getAtr(indicators, last.close);
    const bullishCandle = last.close > last.open;
    const bearishCandle = last.close < last.open;
    const dippedBelow = last.low <= vwap * 0.995;
    const spikedAbove = last.high >= vwap * 1.005;

    if (deviation < -0.008 && dippedBelow && bullishCandle) {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(55 + Math.abs(deviation) * 1500, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('vwap', `Price ${(deviation * 100).toFixed(2)}% below VWAP, reversal candle`, 1),
        ],
      };
    }

    if (deviation > 0.008 && spikedAbove && bearishCandle) {
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(55 + Math.abs(deviation) * 1500, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('vwap', `Price ${(deviation * 100).toFixed(2)}% above VWAP, reversal candle`, 1),
        ],
      };
    }

    return noTrade(ID, [evidence('vwap', `Deviation ${(deviation * 100).toFixed(2)}%, no reversion signal`)]);
  },
};
