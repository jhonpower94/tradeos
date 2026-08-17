import {
  Side,
  SignalStatus,
  countEarlyPackVoters,
  deriveEntryTiming,
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
    entryTiming: deriveEntryTiming(consensus.strategyIds),
  };
}

/** Rank by confidence desc, then early-pack voter count, then symbol. */
export function rankOpportunities(opps: Opportunity[]): Opportunity[] {
  const sorted = [...opps].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const earlyDiff =
      countEarlyPackVoters(b.strategyIds) - countEarlyPackVoters(a.strategyIds);
    if (earlyDiff !== 0) return earlyDiff;
    return a.symbol.localeCompare(b.symbol);
  });
  return sorted.map((o, i) => ({ ...o, rank: i + 1 }));
}

/** Mongo filter for RANKED rows not in the current scan. Does not touch approved. */
export function leftoverRankedFilter(
  userId: string,
  current: Array<{ symbol: string; timeframe: string; side: string }>,
): Record<string, unknown> {
  const q: Record<string, unknown> = { userId, status: SignalStatus.RANKED };
  if (current.length > 0) {
    q.$nor = current.map((o) => ({
      symbol: o.symbol,
      timeframe: o.timeframe,
      side: o.side,
    }));
  }
  return q;
}

/** List contract: newest first-appearance first. Rank is independent of position. */
export function sortByCreatedAtDesc<T extends { createdAt?: Date | string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

export async function persistOpportunities(userId: string, opps: Opportunity[]) {
  const ranked = rankOpportunities(opps);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const docs: Array<Opportunity & { createdAt?: Date }> = [];

  for (const o of ranked) {
    const doc = await Signal.findOneAndUpdate(
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
          entryTiming: o.entryTiming,
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
      { upsert: true, new: true },
    ).lean();
    if (doc) docs.push(doc as Opportunity & { createdAt?: Date });
  }

  await Signal.updateMany(leftoverRankedFilter(userId, ranked), {
    $set: { status: SignalStatus.EXPIRED },
  });

  return sortByCreatedAtDesc(docs);
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
  return Signal.find(q).sort({ createdAt: -1 }).limit(100).lean();
}
