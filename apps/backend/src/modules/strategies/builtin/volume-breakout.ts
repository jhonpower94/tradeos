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

const ID = 'volume_breakout' as const;
const RANGE_LOOKBACK = 20;

export const volumeBreakoutStrategy: Strategy = {
  id: ID,
  name: 'Volume Breakout',
  description: 'Trades directional breakouts of the recent range confirmed by a volume surge.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last || candles.length < RANGE_LOOKBACK + 1) return noTrade(ID);

    const volume = seriesAt(indicators.volume, 0);
    const volumeMa = seriesAt(indicators.volumeMa20, 0);
    if (volume == null || volumeMa == null || volumeMa <= 0) {
      return noTrade(ID, [evidence(ID, 'Insufficient volume data')]);
    }

    const volumeRatio = volume / volumeMa;
    if (volumeRatio < 1.5) {
      return noTrade(ID, [evidence('volume', `Volume ratio ${volumeRatio.toFixed(2)}x, no surge`)]);
    }

    const priorCandles = candles.slice(-RANGE_LOOKBACK - 1, -1);
    const rangeHigh = Math.max(...priorCandles.map((c) => c.high));
    const rangeLow = Math.min(...priorCandles.map((c) => c.low));
    const atr = getAtr(indicators, last.close);
    const strongBody = Math.abs(last.close - last.open) > atr * 0.4;

    if (last.close > rangeHigh && last.close > last.open && strongBody) {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(60 + (volumeRatio - 1.5) * 15, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('volume', `Volume ${volumeRatio.toFixed(2)}x average confirms breakout`, 1),
          evidence('range', `Close broke above ${RANGE_LOOKBACK}-bar range high`, 0.5),
        ],
      };
    }

    if (last.close < rangeLow && last.close < last.open && strongBody) {
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(60 + (volumeRatio - 1.5) * 15, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('volume', `Volume ${volumeRatio.toFixed(2)}x average confirms breakdown`, 1),
          evidence('range', `Close broke below ${RANGE_LOOKBACK}-bar range low`, 0.5),
        ],
      };
    }

    return noTrade(ID, [evidence('volume_breakout', 'Volume surge without a range breakout')]);
  },
};
