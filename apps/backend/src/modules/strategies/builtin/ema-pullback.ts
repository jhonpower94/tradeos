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

const ID = 'ema_pullback' as const;

export const emaPullbackStrategy: Strategy = {
  id: ID,
  name: 'EMA Pullback',
  description: 'Trades pullbacks to the EMA21 within an established EMA50/EMA200 trend.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last) return noTrade(ID);

    const ema21 = seriesAt(indicators.ema21);
    const ema50 = seriesAt(indicators.ema50);
    const ema200 = seriesAt(indicators.ema200);
    if (ema21 == null || ema50 == null) {
      return noTrade(ID, [evidence(ID, 'Insufficient EMA data')]);
    }

    const trendUp = ema200 != null ? ema50 > ema200 : ema21 > ema50;
    const trendDown = ema200 != null ? ema50 < ema200 : ema21 < ema50;

    const touchedEma = last.low <= ema21 * 1.003 && last.high >= ema21 * 0.997;
    const bullishCandle = last.close > last.open;
    const bearishCandle = last.close < last.open;
    const atr = getAtr(indicators, last.close);

    const baseEvidence = [
      evidence('ema21', `EMA21=${ema21.toFixed(4)}`),
      evidence('ema50', `EMA50=${ema50.toFixed(4)}`),
    ];

    if (trendUp && touchedEma && last.close > ema21 && bullishCandle) {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(60 + ((last.close - ema21) / atr) * 5, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [...baseEvidence, evidence('pullback', 'Bullish bounce off EMA21 in uptrend', 1)],
      };
    }

    if (trendDown && touchedEma && last.close < ema21 && bearishCandle) {
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(60 + ((ema21 - last.close) / atr) * 5, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [...baseEvidence, evidence('pullback', 'Bearish rejection off EMA21 in downtrend', 1)],
      };
    }

    return noTrade(ID, [...baseEvidence, evidence('pullback', 'No qualifying pullback')]);
  },
};
