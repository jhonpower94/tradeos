import {
  Side,
  type Candle,
  type Evidence,
  type IndicatorSnapshot,
  type LocationLevel,
  type LocationType,
  type MarketRegime,
  type Opportunity,
  type PatternHit,
  type StrategyId,
  type Timeframe,
} from '@trading-os/shared';
import { lastValid } from '../indicators/index.js';

const BUY_TYPES = new Set<LocationType>(['support', 'pdl', 's1', 's2']);
const SELL_TYPES = new Set<LocationType>(['resistance', 'pdh', 'r1', 'r2']);

export interface NearbyLocationInput {
  close: number;
  atr: number;
  proximityAtr: number;
  indicators: IndicatorSnapshot;
  patterns: PatternHit[];
  pdhPdl?: { high: number; low: number } | null;
}

function pushLevel(
  levels: LocationLevel[],
  type: LocationType,
  price: number | undefined,
  close: number,
  atr: number,
  extra?: { bullish?: boolean },
) {
  if (price == null || !Number.isFinite(price) || atr <= 0) return;
  const distanceAtr = Math.abs(close - price) / atr;
  levels.push({ type, price, distanceAtr, ...extra });
}

/** Collect S/R, VWAP, pivots, order blocks, and PDH/PDL, sorted nearest first. */
export function collectLocationLevels(input: NearbyLocationInput): LocationLevel[] {
  const { close, atr, indicators, patterns, pdhPdl } = input;
  const levels: LocationLevel[] = [];

  for (const p of patterns) {
    if (p.price == null) continue;
    if (p.type === 'support' || p.type === 'resistance') {
      pushLevel(levels, p.type, p.price, close, atr);
    } else if (p.type === 'order_block') {
      pushLevel(levels, 'order_block', p.price, close, atr, { bullish: p.bullish });
    }
  }

  pushLevel(levels, 'vwap', lastValid(indicators.vwap), close, atr);

  const pivots = indicators.pivots;
  if (pivots) {
    pushLevel(levels, 'pivot', pivots.pivot, close, atr);
    pushLevel(levels, 's1', pivots.s1, close, atr);
    pushLevel(levels, 'r1', pivots.r1, close, atr);
    pushLevel(levels, 's2', pivots.s2, close, atr);
    pushLevel(levels, 'r2', pivots.r2, close, atr);
  }

  if (pdhPdl) {
    pushLevel(levels, 'pdh', pdhPdl.high, close, atr);
    pushLevel(levels, 'pdl', pdhPdl.low, close, atr);
  }

  return levels.sort((a, b) => a.distanceAtr - b.distanceAtr);
}

export function findNearbyLocations(input: NearbyLocationInput): LocationLevel[] {
  const proximity = input.proximityAtr > 0 ? input.proximityAtr : 1.5;
  return collectLocationLevels(input).filter((l) => l.distanceAtr <= proximity);
}

export function locationEvidence(locations: LocationLevel[]): Evidence[] {
  return locations.slice(0, 4).map((l) => ({
    source: 'location',
    label: l.type.replace(/_/g, ' '),
    detail: `${l.distanceAtr.toFixed(2)} ATR`,
  }));
}

export function locationBias(level: LocationLevel): Side | null {
  if (BUY_TYPES.has(level.type)) return Side.BUY;
  if (SELL_TYPES.has(level.type)) return Side.SELL;
  if (level.type === 'order_block') return level.bullish ? Side.BUY : Side.SELL;
  return null;
}

export function watchingSide(
  htfTrend: 'bull' | 'bear' | null,
  nearby: LocationLevel[],
): Side | null {
  if (htfTrend === 'bull') return Side.BUY;
  if (htfTrend === 'bear') return Side.SELL;
  if (nearby[0]) return locationBias(nearby[0]);
  return null;
}

export function computeRelativeStrength(
  symbolPct: number | undefined,
  btcPct: number | undefined,
): number | undefined {
  if (symbolPct == null || btcPct == null) return undefined;
  if (!Number.isFinite(symbolPct) || !Number.isFinite(btcPct)) return undefined;
  return symbolPct - btcPct;
}

/** BUY needs a BTC leader; SELL needs a laggard. Missing RS does not veto. */
export function relativeStrengthAligned(side: Side, rs: number | undefined): boolean {
  if (rs == null || !Number.isFinite(rs)) return true;
  if (side === Side.BUY) return rs >= 0;
  return rs <= 0;
}

export function previousDayLevels(candles: Candle[]): { high: number; low: number } | null {
  if (candles.length < 2) return null;
  const prev = candles[candles.length - 2]!;
  if (!Number.isFinite(prev.high) || !Number.isFinite(prev.low)) return null;
  return { high: prev.high, low: prev.low };
}

export function buildWatchingOpportunity(input: {
  symbol: string;
  timeframe: Timeframe;
  side: Side;
  nearby: LocationLevel[];
  atr: number;
  minRR: number;
  minConfidence: number;
  regime: MarketRegime;
  relativeStrength?: number;
}): Opportunity {
  const nearest = input.nearby[0]!;
  const entry = nearest.price;
  const slDist = 1.5 * input.atr;
  const stopLoss = input.side === Side.BUY ? entry - slDist : entry + slDist;
  const takeProfit =
    input.side === Side.BUY ? entry + slDist * input.minRR : entry - slDist * input.minRR;
  const confidence = Math.min(
    input.minConfidence - 1,
    Math.max(40, Math.round(55 - nearest.distanceAtr * 10)),
  );
  const primaryStrategy: StrategyId =
    input.side === Side.BUY ? 'support_bounce' : 'resistance_rejection';
  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    side: input.side,
    confidence,
    entry,
    stopLoss,
    takeProfit,
    riskReward: input.minRR,
    strategyIds: [primaryStrategy],
    primaryStrategy,
    evidence: locationEvidence(input.nearby),
    regime: input.regime,
    locations: input.nearby,
    relativeStrength: input.relativeStrength,
    stage: 'watching',
  };
}
