import { Decision } from '@trading-os/shared';
import type {
  Candle,
  Evidence,
  IndicatorSnapshot,
  PatternHit,
  PatternType,
  StrategyId,
  StrategyResult,
} from '@trading-os/shared';
import { lastValid } from '../indicators/index.js';

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lastCandle(candles: Candle[]): Candle | undefined {
  return candles[candles.length - 1];
}

/** `back = 0` is the last candle, `back = 1` the one before that, etc. */
export function candleAt(candles: Candle[], back = 0): Candle | undefined {
  return candles[candles.length - 1 - back];
}

/** Last finite value in an indicator series, `back = 0` is the most recent bar. */
export function seriesAt(arr: number[] | undefined, back = 0): number | undefined {
  if (!arr) return undefined;
  const idx = arr.length - 1 - back;
  if (idx < 0) return undefined;
  const v = arr[idx];
  return v != null && Number.isFinite(v) ? v : undefined;
}

export function evidence(source: string, label: string, weight = 1, detail?: string): Evidence {
  return { source, label, weight, detail };
}

export function noTrade(strategyId: StrategyId, evidenceList: Evidence[] = []): StrategyResult {
  return { strategyId, decision: Decision.NO_TRADE, confidence: 0, evidence: evidenceList };
}

/** ATR value to use for risk sizing; falls back to 1% of price when unavailable. */
export function getAtr(indicators: IndicatorSnapshot, fallbackPrice: number): number {
  const atr = lastValid(indicators.atr14);
  if (atr != null && atr > 0) return atr;
  return fallbackPrice * 0.01;
}

export interface RiskLevels {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
}

/**
 * Build long-side entry/SL/TP off an ATR-based stop distance.
 * TP is placed at `minRR` multiples of the risk distance (2R by default).
 */
export function buildLongLevels(
  entry: number,
  atr: number,
  atrMultSl = 1.5,
  minRR = 2,
): RiskLevels {
  const riskDistance = Math.max(atr * atrMultSl, entry * 0.002);
  const stopLoss = entry - riskDistance;
  const takeProfit = entry + riskDistance * minRR;
  return { entry, stopLoss, takeProfit, riskReward: minRR };
}

export function buildShortLevels(
  entry: number,
  atr: number,
  atrMultSl = 1.5,
  minRR = 2,
): RiskLevels {
  const riskDistance = Math.max(atr * atrMultSl, entry * 0.002);
  const stopLoss = entry + riskDistance;
  const takeProfit = entry - riskDistance * minRR;
  return { entry, stopLoss, takeProfit, riskReward: minRR };
}

/** Recompute TP from entry/SL to match settings min RR (keeps SL). */
export function rescaleStrategyRiskReward(
  result: StrategyResult,
  minRR: number,
): StrategyResult {
  if (
    result.decision === Decision.NO_TRADE ||
    result.entry == null ||
    result.stopLoss == null ||
    !(minRR > 0)
  ) {
    return result;
  }
  const risk = Math.abs(result.entry - result.stopLoss);
  if (!(risk > 0)) return result;
  const takeProfit =
    result.decision === Decision.BUY
      ? result.entry + risk * minRR
      : result.entry - risk * minRR;
  return { ...result, takeProfit, riskReward: minRR };
}

export function findPattern(
  patterns: PatternHit[],
  type: PatternType,
  bullish?: boolean,
): PatternHit | undefined {
  return patterns.find((p) => p.type === type && (bullish === undefined || p.bullish === bullish));
}

export function findPatterns(
  patterns: PatternHit[],
  type: PatternType,
  bullish?: boolean,
): PatternHit[] {
  return patterns.filter((p) => p.type === type && (bullish === undefined || p.bullish === bullish));
}
