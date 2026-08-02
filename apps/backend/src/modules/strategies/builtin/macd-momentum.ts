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

const ID = 'macd_momentum' as const;

export const macdMomentumStrategy: Strategy = {
  id: ID,
  name: 'MACD Momentum',
  description: 'MACD line crossing its signal line with confirming histogram momentum.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const macdNow = seriesAt(indicators.macd?.macd, 0);
    const macdPrev = seriesAt(indicators.macd?.macd, 1);
    const sigNow = seriesAt(indicators.macd?.signal, 0);
    const sigPrev = seriesAt(indicators.macd?.signal, 1);
    const histNow = seriesAt(indicators.macd?.histogram, 0);
    const histPrev = seriesAt(indicators.macd?.histogram, 1);
    if (
      macdNow == null ||
      macdPrev == null ||
      sigNow == null ||
      sigPrev == null ||
      histNow == null ||
      histPrev == null
    ) {
      return noTrade(ID, [evidence(ID, 'Insufficient MACD data')]);
    }

    const atr = getAtr(indicators, last.close);
    const crossedUp = macdPrev <= sigPrev && macdNow > sigNow;
    const crossedDown = macdPrev >= sigPrev && macdNow < sigNow;
    const risingMomentum = histNow > histPrev;
    const fallingMomentum = histNow < histPrev;
    const histMagnitude = Math.abs(histNow) / (Math.abs(last.close) * 0.001 + 1e-9);

    if (crossedUp && risingMomentum) {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(62 + histMagnitude * 2 + (macdNow > 0 ? 8 : 0), 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('macd', 'MACD crossed above signal', 1),
          evidence('histogram', 'Histogram expanding positively', 0.5),
        ],
      };
    }

    if (crossedDown && fallingMomentum) {
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(62 + histMagnitude * 2 + (macdNow < 0 ? 8 : 0), 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('macd', 'MACD crossed below signal', 1),
          evidence('histogram', 'Histogram expanding negatively', 0.5),
        ],
      };
    }

    return noTrade(ID, [evidence('macd', 'No confirmed MACD crossover')]);
  },
};
