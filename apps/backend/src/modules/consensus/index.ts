import {
  Decision,
  MarketRegime,
  Side,
  type ConsensusResult,
  type Evidence,
  type IndicatorSnapshot,
  type PatternHit,
  type StrategyId,
  type StrategyResult,
} from '@trading-os/shared';
import { lastValid } from '../indicators/index.js';
import { detectRegime, type RegimeResult } from '../regime/index.js';
import type { HtfTrend } from './htf.js';

export type { RegimeResult };
export { detectRegime } from '../regime/index.js';
export { resolveParentTimeframe, detectHtfTrend } from './htf.js';
export type { HtfTrend } from './htf.js';

export interface ConsensusInput {
  strategies: StrategyResult[];
  patterns: PatternHit[];
  indicators: IndicatorSnapshot;
  minScore?: number;
  /** Precomputed by scanner; avoids detecting twice. */
  regimeResult?: RegimeResult;
  minAlignedStrategies?: number;
  minAgreementRatio?: number;
  /** Parent-TF trend for hard veto (`null` = unavailable / skip). */
  htfTrend?: HtfTrend | null;
  htfVetoEnabled?: boolean;
}

export function buildConsensus(input: ConsensusInput): ConsensusResult {
  const { strategies, patterns, indicators } = input;
  const regimeResult = input.regimeResult ?? detectRegime(indicators);
  const regime = regimeResult.regime;
  const evidence: Evidence[] = [...regimeResult.evidence];
  const minAligned = input.minAlignedStrategies ?? 2;
  const minAgreementRatio = input.minAgreementRatio ?? 0.6;
  const htfVetoEnabled = input.htfVetoEnabled !== false;

  const actionable = strategies.filter((s) => s.decision !== Decision.NO_TRADE);
  const buys = actionable.filter((s) => s.decision === Decision.BUY);
  const sells = actionable.filter((s) => s.decision === Decision.SELL);

  let side: Side | null = null;
  if (buys.length > sells.length) side = Side.BUY;
  else if (sells.length > buys.length) side = Side.SELL;
  else if (buys.length && buys.length === sells.length) {
    const buyConf = buys.reduce((a, s) => a + s.confidence, 0);
    const sellConf = sells.reduce((a, s) => a + s.confidence, 0);
    side = buyConf >= sellConf ? Side.BUY : Side.SELL;
  }

  if (!side) {
    return {
      score: 0,
      regime,
      side: null,
      evidence: [
        ...evidence,
        { source: 'consensus', label: 'No actionable strategies' },
      ],
      veto: 'No trade consensus',
      strategyIds: [],
    };
  }

  const aligned = actionable.filter((s) => s.decision === (side === Side.BUY ? Decision.BUY : Decision.SELL));
  const conflicting = actionable.filter((s) => s.decision !== (side === Side.BUY ? Decision.BUY : Decision.SELL));

  const avgConf =
    aligned.reduce((a, s) => a + s.confidence, 0) / Math.max(aligned.length, 1);
  const strategyScore = Math.min(100, (aligned.length / Math.max(strategies.length, 1)) * 100) * 0.35 +
    avgConf * 0.35;

  const ema50 = lastValid(indicators.ema50);
  const ema200 = lastValid(indicators.ema200);
  const adx = regimeResult.adx;
  let trendScore = 50;
  if (ema50 != null && ema200 != null) {
    const bullishTrend = ema50 > ema200;
    if ((side === Side.BUY && bullishTrend) || (side === Side.SELL && !bullishTrend)) {
      trendScore = 80 + Math.min(20, adx);
      evidence.push({ source: 'trend', label: 'Trend aligned', weight: 0.2 });
    } else {
      trendScore = 30;
      evidence.push({ source: 'trend', label: 'Trend conflict', weight: 0.2 });
    }
  }

  const patternAligned = patterns.filter(
    (p) => (side === Side.BUY && p.bullish) || (side === Side.SELL && !p.bullish),
  );
  const patternScore = Math.min(100, patternAligned.length * 25);
  if (patternAligned.length) {
    evidence.push({
      source: 'pattern',
      label: `${patternAligned.length} confirming patterns`,
      weight: 0.15,
    });
  }

  const vol = lastValid(indicators.volume);
  const volMa = lastValid(indicators.volumeMa20);
  let volumeScore = 50;
  if (vol != null && volMa != null) {
    if (vol > volMa) {
      volumeScore = 85;
      evidence.push({ source: 'volume', label: 'Volume above average', weight: 0.1 });
    } else {
      volumeScore = 40;
    }
  }

  const structureTypes = new Set([
    'break_of_structure',
    'change_of_character',
    'order_block',
    'fair_value_gap',
    'liquidity_sweep',
  ]);
  const structureHits = patternAligned.filter((p) => structureTypes.has(p.type));
  const structureScore = Math.min(100, structureHits.length * 35);

  const primary = [...aligned].sort((a, b) => b.confidence - a.confidence)[0]!;
  let rrScore = 50;
  const rr = primary.riskReward ?? 0;
  if (rr >= 2) {
    rrScore = 90;
    evidence.push({ source: 'rr', label: `Risk Reward ${rr.toFixed(2)}`, weight: 0.1 });
  } else if (rr >= 1.5) rrScore = 70;
  else if (rr > 0) rrScore = 40;

  let score =
    strategyScore * 0.5 +
    trendScore * 0.2 +
    patternScore * 0.15 +
    volumeScore * 0.1 +
    structureScore * 0.05 +
    (rrScore - 50) * 0.1;

  score = Math.max(0, Math.min(100, score));
  if (conflicting.length >= aligned.length) {
    score *= 0.7;
    evidence.push({ source: 'consensus', label: 'Conflicting strategies penalty' });
  }

  let veto: string | undefined;
  const agreementRatio = aligned.length / Math.max(actionable.length, 1);
  if (aligned.length < minAligned || agreementRatio < minAgreementRatio) {
    veto = 'Insufficient strategy agreement';
    score = Math.min(score, 40);
    evidence.push({
      source: 'consensus',
      label: `Aligned ${aligned.length}/${actionable.length} (need ≥${minAligned}, ratio ≥${minAgreementRatio})`,
    });
  } else if (
    (regime === MarketRegime.TRENDING_BEAR && side === Side.BUY) ||
    (regime === MarketRegime.TRENDING_BULL && side === Side.SELL) ||
    (regime === MarketRegime.TRENDING_VOLATILE &&
      side === Side.BUY &&
      regimeResult.minusDI > regimeResult.plusDI) ||
    (regime === MarketRegime.TRENDING_VOLATILE &&
      side === Side.SELL &&
      regimeResult.plusDI > regimeResult.minusDI)
  ) {
    veto = 'Strong opposing market regime';
    score = Math.min(score, 40);
  } else if (
    htfVetoEnabled &&
    input.htfTrend != null &&
    ((side === Side.BUY && input.htfTrend === 'bear') ||
      (side === Side.SELL && input.htfTrend === 'bull'))
  ) {
    veto = 'HTF trend opposing';
    score = Math.min(score, 40);
    evidence.push({
      source: 'htf',
      label: `HTF trend ${input.htfTrend} opposes ${side}`,
      weight: 0.3,
    });
  } else if (htfVetoEnabled && input.htfTrend != null) {
    evidence.push({
      source: 'htf',
      label: `HTF trend ${input.htfTrend} aligned`,
      weight: 0.2,
    });
  }

  for (const s of aligned) {
    evidence.push({
      source: s.strategyId,
      label: `${s.strategyId} ${s.decision} (${s.confidence})`,
      weight: s.confidence / 100,
    });
  }

  const strategyIds = aligned.map((s) => s.strategyId) as StrategyId[];

  return {
    score: Math.round(score * 10) / 10,
    regime,
    side,
    evidence,
    veto,
    entry: primary.entry,
    stopLoss: primary.stopLoss,
    takeProfit: primary.takeProfit,
    riskReward: primary.riskReward,
    primaryStrategy: primary.strategyId,
    strategyIds,
  };
}
