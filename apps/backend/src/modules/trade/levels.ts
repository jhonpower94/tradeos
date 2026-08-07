import { Side } from '@trading-os/shared';

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
