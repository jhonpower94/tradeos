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

const ID = 'adx_ignition' as const;
const QUIET_MAX = 18;
const IGNITE_MIN = 22;
const LOOKBACK = 8;

export const adxIgnitionStrategy: Strategy = {
  id: ID,
  name: 'ADX Ignition',
  description:
    'Trades when ADX rises out of a quiet zone with +DI/−DI alignment — early trend ignition.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last || candles.length < LOOKBACK + 5) return noTrade(ID);

    const adxArr = indicators.adx14?.adx;
    const plusArr = indicators.adx14?.plusDI;
    const minusArr = indicators.adx14?.minusDI;
    if (!adxArr || !plusArr || !minusArr) {
      return noTrade(ID, [evidence(ID, 'Insufficient ADX data')]);
    }

    const adxNow = seriesAt(adxArr, 0);
    const adxPrev = seriesAt(adxArr, 1);
    const plus = seriesAt(plusArr, 0);
    const minus = seriesAt(minusArr, 0);
    if (adxNow == null || adxPrev == null || plus == null || minus == null) {
      return noTrade(ID, [evidence(ID, 'ADX series incomplete')]);
    }

    // Recent bars were quiet (ADX low), now rising through ignition threshold
    let quietBars = 0;
    for (let back = 2; back <= LOOKBACK + 1; back++) {
      const a = seriesAt(adxArr, back);
      if (a != null && a < QUIET_MAX) quietBars++;
    }
    if (quietBars < 3) {
      return noTrade(ID, [evidence('adx', 'No recent quiet ADX base')]);
    }

    const igniting = adxPrev < IGNITE_MIN && adxNow >= IGNITE_MIN && adxNow > adxPrev;
    if (!igniting) {
      return noTrade(ID, [
        evidence('adx', `ADX ${adxNow.toFixed(1)} not igniting from quiet zone`),
      ]);
    }

    const atr = getAtr(indicators, last.close);
    const diGap = Math.abs(plus - minus);

    if (plus > minus && last.close > last.open) {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(60 + (adxNow - IGNITE_MIN) * 2 + diGap * 0.5, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('adx', `ADX ignition ${adxPrev.toFixed(1)}→${adxNow.toFixed(1)} with +DI lead`, 1),
        ],
      };
    }

    if (minus > plus && last.close < last.open) {
      const levels = buildShortLevels(last.close, atr);
      const confidence = clamp(60 + (adxNow - IGNITE_MIN) * 2 + diGap * 0.5, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.SELL,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence('adx', `ADX ignition ${adxPrev.toFixed(1)}→${adxNow.toFixed(1)} with −DI lead`, 1),
        ],
      };
    }

    return noTrade(ID, [evidence('adx', 'ADX igniting but DI / candle not aligned')]);
  },
};
