import {
  Side,
  SignalStatus,
  type Opportunity,
  type ConsensusResult,
  type Timeframe,
} from '@trading-os/shared';
import { Signal } from '../../models/Signal.js';

function estimateDuration(tf: string): string {
  const map: Record<string, string> = {
    '1m': '15m–1h',
    '5m': '1h–4h',
    '15m': '4h–12h',
    '30m': '8h–1d',
    '1h': '1d–3d',
    '4h': '3d–1w',
    '1d': '1w–1m',
  };
  return map[tf] ?? 'unknown';
}

export function consensusToOpportunity(
  symbol: string,
  timeframe: Timeframe,
  consensus: ConsensusResult,
  minScore = 75,
): Opportunity | null {
  if (!consensus.side || consensus.veto) return null;
  if (consensus.score < minScore) return null;
  if (
    consensus.entry == null ||
    consensus.stopLoss == null ||
    consensus.takeProfit == null ||
    !consensus.primaryStrategy
  ) {
    return null;
  }
  return {
    symbol,
    timeframe,
    side: consensus.side,
    confidence: consensus.score,
    entry: consensus.entry,
    stopLoss: consensus.stopLoss,
    takeProfit: consensus.takeProfit,
    riskReward: consensus.riskReward ?? 0,
    strategyIds: consensus.strategyIds,
    primaryStrategy: consensus.primaryStrategy,
    evidence: consensus.evidence,
    regime: consensus.regime,
    estimatedDuration: estimateDuration(timeframe),
  };
}

export function rankOpportunities(opps: Opportunity[]): Opportunity[] {
  return [...opps]
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (b.riskReward !== a.riskReward) return b.riskReward - a.riskReward;
      return a.symbol.localeCompare(b.symbol);
    })
    .map((o, i) => ({ ...o, rank: i + 1 }));
}

export async function persistOpportunities(userId: string, opps: Opportunity[]) {
  const ranked = rankOpportunities(opps);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  for (const o of ranked) {
    await Signal.findOneAndUpdate(
      {
        userId,
        symbol: o.symbol,
        timeframe: o.timeframe,
        side: o.side,
        status: { $in: [SignalStatus.RANKED, SignalStatus.APPROVED] },
      },
      {
        $set: {
          confidence: o.confidence,
          entry: o.entry,
          stopLoss: o.stopLoss,
          takeProfit: o.takeProfit,
          riskReward: o.riskReward,
          strategyIds: o.strategyIds,
          primaryStrategy: o.primaryStrategy,
          evidence: o.evidence,
          regime: o.regime,
          estimatedDuration: o.estimatedDuration,
          rank: o.rank,
          consensusSnapshot: o,
          expiresAt,
          status: SignalStatus.RANKED,
        },
        $setOnInsert: {
          userId,
          symbol: o.symbol,
          timeframe: o.timeframe,
          side: o.side,
        },
      },
      { upsert: true },
    );
  }
  return ranked;
}

export async function listOpportunities(userId: string, filters?: {
  minConfidence?: number;
  timeframe?: string;
  side?: Side;
  search?: string;
}) {
  const q: Record<string, unknown> = {
    userId,
    status: SignalStatus.RANKED,
    expiresAt: { $gt: new Date() },
  };
  if (filters?.minConfidence != null) q.confidence = { $gte: filters.minConfidence };
  if (filters?.timeframe) q.timeframe = filters.timeframe;
  if (filters?.side) q.side = filters.side;
  if (filters?.search) q.symbol = new RegExp(filters.search, 'i');
  return Signal.find(q).sort({ confidence: -1, riskReward: -1 }).limit(100).lean();
}
