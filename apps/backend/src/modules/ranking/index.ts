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

export function isWatching(o: { stage?: string; status?: string }): boolean {
  return o.stage === 'watching' || o.status === 'watching';
}

/** Mongo filter for ranked/watching rows not in the current scan. Does not touch approved. */
export function leftoverActiveFilter(
  userId: string,
  current: Array<{ symbol: string; timeframe: string; side: string }>,
): Record<string, unknown> {
  const q: Record<string, unknown> = {
    userId,
    status: { $in: [SignalStatus.RANKED, SignalStatus.WATCHING] },
  };
  if (current.length > 0) {
    q.$nor = current.map((o) => ({
      symbol: o.symbol,
      timeframe: o.timeframe,
      side: o.side,
    }));
  }
  return q;
}

/**
 * Like leftoverActiveFilter but scoped to one symbol so a single-symbol rescan
 * cannot expire other pairs' ranked/watching rows.
 */
export function leftoverActiveFilterForSymbol(
  userId: string,
  symbol: string,
  current: Array<{ symbol: string; timeframe: string; side: string }>,
): Record<string, unknown> {
  const forSymbol = current.filter((o) => o.symbol === symbol);
  return {
    ...leftoverActiveFilter(userId, forSymbol),
    symbol,
  };
}

/** Triggered (ranked) first, then newest createdAt. */
export function sortTriggeredThenNewest<
  T extends { createdAt?: Date | string; stage?: string; status?: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aw = isWatching(a) ? 1 : 0;
    const bw = isWatching(b) ? 1 : 0;
    if (aw !== bw) return aw - bw;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

function persistStatus(o: Opportunity): SignalStatus {
  return o.stage === 'watching' ? SignalStatus.WATCHING : SignalStatus.RANKED;
}

async function upsertOpportunityDocs(userId: string, opps: Opportunity[]) {
  const triggered = opps.filter((o) => o.stage !== 'watching');
  const watching = opps.filter((o) => o.stage === 'watching');
  const ranked = [...rankOpportunities(triggered), ...watching];
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const docs: Array<Opportunity & { createdAt?: Date; status?: string }> = [];

  for (const o of ranked) {
    const status = persistStatus(o);
    const isWatchingOpp = o.stage === 'watching';
    const filter = {
      userId,
      symbol: o.symbol,
      timeframe: o.timeframe,
      side: o.side,
      status: { $in: [SignalStatus.RANKED, SignalStatus.WATCHING, SignalStatus.APPROVED] },
    };
    const existing = await Signal.findOne(filter).select('status').lean();
    const $set: Record<string, unknown> = {
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
      relativeStrength: o.relativeStrength,
      stage: o.stage,
      locations: o.locations,
      consensusSnapshot: o,
      expiresAt,
    };
    if (existing?.status !== SignalStatus.APPROVED) {
      $set.status = status;
    }
    if (!isWatchingOpp && o.rank != null) {
      $set.rank = o.rank;
    }
    const update: Record<string, unknown> = {
      $set,
      $setOnInsert: {
        userId,
        symbol: o.symbol,
        timeframe: o.timeframe,
        side: o.side,
      },
    };
    if (isWatchingOpp && existing?.status !== SignalStatus.APPROVED) {
      update.$unset = { rank: 1 };
    }
    const doc = await Signal.findOneAndUpdate(filter, update, { upsert: true, new: true }).lean();
    if (doc) docs.push(doc as Opportunity & { createdAt?: Date; status?: string });
  }

  return { ranked, docs };
}

export async function persistOpportunities(userId: string, opps: Opportunity[]) {
  const { ranked, docs } = await upsertOpportunityDocs(userId, opps);

  await Signal.updateMany(leftoverActiveFilter(userId, ranked), {
    $set: { status: SignalStatus.EXPIRED },
  });

  return sortTriggeredThenNewest(docs);
}

/** Upsert opps for one symbol and expire only that symbol's leftover ranked/watching rows. */
export async function persistSymbolOpportunities(
  userId: string,
  symbol: string,
  opps: Opportunity[],
) {
  const scoped = opps.filter((o) => o.symbol === symbol);
  const { ranked, docs } = await upsertOpportunityDocs(userId, scoped);

  await Signal.updateMany(leftoverActiveFilterForSymbol(userId, symbol, ranked), {
    $set: { status: SignalStatus.EXPIRED },
  });

  return sortTriggeredThenNewest(docs);
}

export async function listOpportunities(userId: string, filters?: {
  minConfidence?: number;
  timeframe?: string;
  side?: Side;
  search?: string;
}) {
  const q: Record<string, unknown> = {
    userId,
    status: { $in: [SignalStatus.RANKED, SignalStatus.WATCHING] },
    expiresAt: { $gt: new Date() },
  };
  if (filters?.minConfidence != null) {
    q.$or = [
      { status: SignalStatus.WATCHING },
      { status: SignalStatus.RANKED, confidence: { $gte: filters.minConfidence } },
    ];
  }
  if (filters?.timeframe) q.timeframe = filters.timeframe;
  if (filters?.side) q.side = filters.side;
  if (filters?.search) q.symbol = new RegExp(filters.search, 'i');
  return Signal.find(q).sort({ status: 1, createdAt: -1 }).limit(100).lean();
}
