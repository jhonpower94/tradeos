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

const ID = 'stoch_rsi_reversion' as const;
const OVERSOLD = 20;
const OVERBOUGHT = 80;

export const stochRsiReversionStrategy: Strategy = {
  id: ID,
  name: 'Stoch RSI Reversion',
  description:
    'Mean-reversion trades on Stochastic RSI %K/%D crosses from oversold or overbought zones.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const kNow = seriesAt(indicators.stochRsi?.k, 0);
    const dNow = seriesAt(indicators.stochRsi?.d, 0);
    const kPrev = seriesAt(indicators.stochRsi?.k, 1);
    const dPrev = seriesAt(indicators.stochRsi?.d, 1);
    if (kNow == null || dNow == null || kPrev == null || dPrev == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient Stoch RSI data')]);
    }

    const atr = getAtr(indicators, last.close);
    const crossedUp = kPrev <= dPrev && kNow > dNow;
    const crossedDown = kPrev >= dPrev && kNow < dNow;
    const fromOversold = Math.min(kPrev, dPrev) < OVERSOLD;
    const fromOverbought = Math.max(kPrev, dPrev) > OVERBOUGHT;

    if (crossedUp && fromOversold) {
      const depth = OVERSOLD - Math.min(kPrev, dPrev);
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(58 + depth * 0.8 + (kNow - dNow) * 0.5, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            'stoch_rsi',
            `%K crossed above %D from oversold (${kPrev.toFixed(1)} → ${kNow.toFixed(1)})`,
            1,
          ),
        ],
      };
    }

    if (crossedDown && fromOverbought) {
      const depth = Math.max(kPrev, dPrev) - OVERBOUGHT;
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(58 + depth * 0.8 + (dNow - kNow) * 0.5, 0, 90);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            'stoch_rsi',
            `%K crossed below %D from overbought (${kPrev.toFixed(1)} → ${kNow.toFixed(1)})`,
            1,
          ),
        ],
      };
    }

    return noTrade(ID, [evidence('stoch_rsi', 'No Stoch RSI reversion cross')]);
  },
};
