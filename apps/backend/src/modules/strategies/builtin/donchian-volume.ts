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

const ID = 'donchian_volume' as const;
const CHANNEL = 20;
const VOL_MULT = 1.5;

export const donchianVolumeStrategy: Strategy = {
  id: ID,
  name: 'Donchian + Volume',
  description:
    'Turtle-style Donchian channel break confirmed by volume ≥ 1.5× the 20-bar volume average.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last || candles.length < CHANNEL + 2) return noTrade(ID);

    const volume = seriesAt(indicators.volume, 0);
    const volumeMa = seriesAt(indicators.volumeMa20, 0);
    if (volume == null || volumeMa == null || volumeMa <= 0) {
      return noTrade(ID, [evidence(ID, 'Insufficient volume data')]);
    }

    const volumeRatio = volume / volumeMa;
    if (volumeRatio < VOL_MULT) {
      return noTrade(ID, [
        evidence('volume', `Volume ${volumeRatio.toFixed(2)}x < ${VOL_MULT}x required`),
      ]);
    }

    // Donchian from prior CHANNEL bars (exclude current)
    const prior = candles.slice(-CHANNEL - 1, -1);
    const upper = Math.max(...prior.map((c) => c.high));
    const lower = Math.min(...prior.map((c) => c.low));
    const atr = getAtr(indicators, last.close);

    if (last.close > upper && last.close > last.open) {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(62 + (volumeRatio - VOL_MULT) * 12, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('donchian', `Close above ${CHANNEL}-bar Donchian high`, 1),
          evidence('volume', `Volume ${volumeRatio.toFixed(2)}x average`, 0.75),
        ],
      };
    }

    if (last.close < lower && last.close < last.open) {
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(62 + (volumeRatio - VOL_MULT) * 12, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('donchian', `Close below ${CHANNEL}-bar Donchian low`, 1),
          evidence('volume', `Volume ${volumeRatio.toFixed(2)}x average`, 0.75),
        ],
      };
    }

    return noTrade(ID, [evidence('donchian', 'Volume surge without Donchian break')]);
  },
};
