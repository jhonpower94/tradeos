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

const ID = 'breakout' as const;

export const breakoutStrategy: Strategy = {
  id: ID,
  name: 'Donchian Breakout',
  description: 'Trades breakouts beyond the prior Donchian channel with volume confirmation.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const prevUpper = seriesAt(indicators.donchian?.upper, 1);
    const prevLower = seriesAt(indicators.donchian?.lower, 1);
    const volume = seriesAt(indicators.volume, 0);
    const volumeMa = seriesAt(indicators.volumeMa20, 0);
    if (prevUpper == null || prevLower == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient Donchian data')]);
    }

    const atr = getAtr(indicators, last.close);
    const volumeConfirmed = volume != null && volumeMa != null && volume > volumeMa;

    const brokeUp = last.close > prevUpper;
    const brokeDown = last.close < prevLower;

    if (brokeUp) {
      const distancePct = (last.close - prevUpper) / prevUpper;
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(58 + distancePct * 3000 + (volumeConfirmed ? 15 : 0), 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('breakout', 'Close broke above prior Donchian upper channel', 1),
          ...(volumeConfirmed ? [evidence('volume', 'Volume above 20-period average', 0.5)] : []),
        ],
      };
    }

    if (brokeDown) {
      const distancePct = (prevLower - last.close) / prevLower;
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(58 + distancePct * 3000 + (volumeConfirmed ? 15 : 0), 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('breakout', 'Close broke below prior Donchian lower channel', 1),
          ...(volumeConfirmed ? [evidence('volume', 'Volume above 20-period average', 0.5)] : []),
        ],
      };
    }

    return noTrade(ID, [evidence('breakout', 'Price within channel, no breakout')]);
  },
};
