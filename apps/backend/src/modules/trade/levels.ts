import {
  MarketRegime,
  Side,
  Timeframe,
  type Opportunity,
  type StrategyId,
} from '@trading-os/shared';

export type ReanchoredLevels = {
  stopLoss: number;
  takeProfit: number;
  initialStopLoss: number;
  riskReward: number;
  slDist: number;
  tpDist: number;
};

/**
 * Preserve signal SL/TP distances but anchor them to the actual fill price
 * so dollar risk stays ≈ equity × maxRiskPerTrade after entry drift.
 */
export function reanchorRiskLevels(
  side: Side,
  fill: number,
  signalEntry: number,
  signalStopLoss: number,
  signalTakeProfit: number,
): ReanchoredLevels {
  const slDist = Math.abs(signalEntry - signalStopLoss);
  const tpDist = Math.abs(signalTakeProfit - signalEntry);
  const riskReward = slDist > 0 ? tpDist / slDist : 0;

  if (side === Side.BUY) {
    const stopLoss = fill - slDist;
    const takeProfit = fill + tpDist;
    return {
      stopLoss,
      takeProfit,
      initialStopLoss: stopLoss,
      riskReward,
      slDist,
      tpDist,
    };
  }

  const stopLoss = fill + slDist;
  const takeProfit = fill - tpDist;
  return {
    stopLoss,
    takeProfit,
    initialStopLoss: stopLoss,
    riskReward,
    slDist,
    tpDist,
  };
}

/** Soft entry-drift band (matches softPrecheck). */
export const ENTRY_DRIFT_MAX = 0.02;

export function entryDriftExceeded(signalEntry: number, fill: number, max = ENTRY_DRIFT_MAX): boolean {
  if (!(signalEntry > 0) || !(fill > 0)) return true;
  return Math.abs(fill - signalEntry) / signalEntry > max;
}

export class CloneLevelsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloneLevelsError';
  }
}

/**
 * Build a clone opportunity from a source trade: live entry with the same SL/TP
 * distances (and RR) as the original fill. Does not consult the scanner.
 */
export function buildCloneOpportunity(
  source: {
    symbol: string;
    side: Side | string;
    entryPrice?: number | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
  },
  liveEntry: number,
  meta?: {
    timeframe?: Timeframe;
    primaryStrategy?: StrategyId;
    strategyIds?: StrategyId[];
    confidence?: number;
    regime?: MarketRegime;
    sourceTradeId?: string;
  },
): Opportunity {
  const entry = Number(source.entryPrice);
  const stopLoss = Number(source.stopLoss);
  const takeProfit = Number(source.takeProfit);
  if (!(entry > 0) || !(stopLoss > 0) || !(takeProfit > 0)) {
    throw new CloneLevelsError('Source trade missing entry/SL/TP to clone');
  }
  if (!(liveEntry > 0)) {
    throw new CloneLevelsError('No live price to clone against');
  }

  const levels = reanchorRiskLevels(
    source.side as Side,
    liveEntry,
    entry,
    stopLoss,
    takeProfit,
  );
  const primaryStrategy = meta?.primaryStrategy ?? ('breakout' as StrategyId);
  const strategyIds = meta?.strategyIds?.length ? meta.strategyIds : [primaryStrategy];

  return {
    symbol: source.symbol,
    timeframe: meta?.timeframe ?? Timeframe.H1,
    side: source.side as Side,
    confidence: meta?.confidence ?? 80,
    entry: liveEntry,
    stopLoss: levels.stopLoss,
    takeProfit: levels.takeProfit,
    riskReward: levels.riskReward,
    strategyIds,
    primaryStrategy,
    evidence: [
      {
        source: 'copy',
        label: meta?.sourceTradeId
          ? `Straight clone of trade ${meta.sourceTradeId}`
          : 'Straight clone of prior trade',
        weight: 1,
      },
    ],
    regime: meta?.regime ?? MarketRegime.UNKNOWN,
  };
}
