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

/**
 * Rebuild stop + TP from entry using settings ATR multiple and min RR.
 * Replaces hardcoded strategy 1.5× ATR when scanner applies user risk settings.
 */
export function applyAtrStopAndRr(
  result: StrategyResult,
  atr: number,
  atrSlMultiplier: number,
  minRR: number,
): StrategyResult {
  if (
    result.decision === Decision.NO_TRADE ||
    result.entry == null ||
    !(atr > 0) ||
    !(atrSlMultiplier > 0) ||
    !(minRR > 0)
  ) {
    return result;
  }
  const entry = result.entry;
  const riskDistance = Math.max(atr * atrSlMultiplier, entry * 0.002);
  if (result.decision === Decision.BUY) {
    return {
      ...result,
      stopLoss: entry - riskDistance,
      takeProfit: entry + riskDistance * minRR,
      riskReward: minRR,
    };
  }
  return {
    ...result,
    stopLoss: entry + riskDistance,
    takeProfit: entry - riskDistance * minRR,
    riskReward: minRR,
  };
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

/**
 * Bullish demand zone reclaim: wick into the zone, close back above zone high,
 * bullish body, and did not close through the floor.
 */
export function isDemandZoneReclaim(
  candle: Candle,
  zoneLow: number,
  zoneHigh: number,
): boolean {
  if (!(zoneHigh > zoneLow) || !Number.isFinite(zoneLow) || !Number.isFinite(zoneHigh)) {
    return false;
  }
  const wickedInto = candle.low <= zoneHigh;
  const closedReclaimed = candle.close > zoneHigh;
  const bullish = candle.close > candle.open;
  const notBroken = candle.close >= zoneLow;
  return wickedInto && closedReclaimed && bullish && notBroken;
}

/**
 * Bearish supply zone reclaim: wick into the zone, close back below zone low,
 * bearish body, and did not close through the ceiling.
 */
export function isSupplyZoneReclaim(
  candle: Candle,
  zoneLow: number,
  zoneHigh: number,
): boolean {
  if (!(zoneHigh > zoneLow) || !Number.isFinite(zoneLow) || !Number.isFinite(zoneHigh)) {
    return false;
  }
  const wickedInto = candle.high >= zoneLow;
  const closedReclaimed = candle.close < zoneLow;
  const bearish = candle.close < candle.open;
  const notBroken = candle.close <= zoneHigh;
  return wickedInto && closedReclaimed && bearish && notBroken;
}

export type ImpulseDirection = 'up' | 'down' | 'flat';

export interface ImpulseMeasure {
  high: number;
  low: number;
  /** Absolute index in the full candle array. */
  highIdx: number;
  lowIdx: number;
  /** (high − low) / mid × 100 */
  rangePct: number;
  /** (high − low) / atr */
  rangeAtr: number;
  /** `up` when the high is more recent than the low (rally then stall). */
  direction: ImpulseDirection;
}

/** Lookback swing high/low and whether the impulse finished as a rally or selloff. */
export function measureImpulse(
  candles: Candle[],
  lookback = 40,
  atr?: number,
): ImpulseMeasure | null {
  if (candles.length < 5) return null;
  const n = Math.min(lookback, candles.length);
  const slice = candles.slice(-n);
  const offset = candles.length - slice.length;
  let high = -Infinity;
  let low = Infinity;
  let highIdx = offset;
  let lowIdx = offset;
  for (let i = 0; i < slice.length; i++) {
    const c = slice[i]!;
    if (c.high >= high) {
      high = c.high;
      highIdx = offset + i;
    }
    if (c.low <= low) {
      low = c.low;
      lowIdx = offset + i;
    }
  }
  if (!(high > low) || !Number.isFinite(high) || !Number.isFinite(low)) return null;
  const mid = (high + low) / 2;
  const atrVal = atr != null && atr > 0 ? atr : mid * 0.01;
  const range = high - low;
  const direction: ImpulseDirection =
    highIdx === lowIdx ? 'flat' : highIdx > lowIdx ? 'up' : 'down';
  return {
    high,
    low,
    highIdx,
    lowIdx,
    rangePct: (range / mid) * 100,
    rangeAtr: range / atrVal,
    direction,
  };
}

/** True when swing range ≥ max(6% of price, 4 × ATR). */
export function isLargeImpulse(impulse: ImpulseMeasure, atr: number, price: number): boolean {
  const range = impulse.high - impulse.low;
  return range >= Math.max(price * 0.06, atr * 4);
}

/**
 * How far price has already traveled away from the impulse extreme.
 * SELL uses distance below `high`; BUY uses distance above `low`.
 */
export function extensionFromExtreme(
  side: 'buy' | 'sell',
  close: number,
  extreme: number,
  atr: number,
): { atrMult: number; pct: number } {
  const safeAtr = atr > 0 ? atr : Math.abs(extreme) * 0.01 || 1;
  const dist = side === 'sell' ? extreme - close : close - extreme;
  return {
    atrMult: dist / safeAtr,
    pct: extreme !== 0 ? (dist / Math.abs(extreme)) * 100 : 0,
  };
}

/** Already spent move away from the extreme (knife-catch / late fade). */
export function isAlreadyExtended(
  side: 'buy' | 'sell',
  close: number,
  extreme: number,
  atr: number,
  atrCap = 2.5,
  pctCap = 5,
): boolean {
  const { atrMult, pct } = extensionFromExtreme(side, close, extreme, atr);
  return atrMult > atrCap || pct > pctCap;
}

/** Still early enough after the impulse extreme to fade. */
export function isStillNearExtreme(
  side: 'buy' | 'sell',
  close: number,
  extreme: number,
  atr: number,
  atrCap = 1.5,
  pctCap = 3,
): boolean {
  const { atrMult, pct } = extensionFromExtreme(side, close, extreme, atr);
  if (atrMult <= 0) return true;
  return atrMult <= atrCap && pct <= pctCap;
}
