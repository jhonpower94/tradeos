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

export type RankOptions = {
  minConfidence?: number;
  maxConfidence?: number;
  preferMidConfidence?: boolean;
};

export function consensusToOpportunity(
  symbol: string,
  timeframe: Timeframe,
  consensus: ConsensusResult,
  minScore = 75,
  maxScore = 100,
): Opportunity | null {
  if (!consensus.side || consensus.veto) return null;
  if (consensus.score < minScore) return null;
  if (consensus.score > maxScore) return null;
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

function clampBand(minConfidence: number, maxConfidence: number): { lo: number; hi: number; mid: number } {
  const lo = Math.min(minConfidence, maxConfidence);
  const hi = Math.max(minConfidence, maxConfidence);
  return { lo, hi, mid: (lo + hi) / 2 };
}

/**
 * Rank triggered opportunities.
 * - Default (preferMidConfidence): nearest midpoint of [min, max] first, then lower confidence,
 *   then early-pack voters, then symbol.
 * - Classic: confidence descending, then early-pack, then symbol.
 */
export function rankOpportunities(
  opps: Opportunity[],
  opts?: RankOptions,
): Opportunity[] {
  const minConfidence = opts?.minConfidence ?? 0;
  const maxConfidence = opts?.maxConfidence ?? 100;
  const preferMid = opts?.preferMidConfidence !== false;
  const { mid } = clampBand(minConfidence, maxConfidence);

  const sorted = [...opps].sort((a, b) => {
    if (preferMid) {
      const da = Math.abs(a.confidence - mid);
      const db = Math.abs(b.confidence - mid);
      if (da !== db) return da - db;
      // Prefer lower confidence within the same distance (earlier / less "confirmed").
      if (a.confidence !== b.confidence) return a.confidence - b.confidence;
    } else if (b.confidence !== a.confidence) {
      return b.confidence - a.confidence;
    }
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

/**
 * Triggered first, then mid-band preference (or classic confidence), then newest.
 * Used for API/UI lists that mix watching + triggered.
 */
export function sortOpportunitiesForDisplay<
  T extends {
    createdAt?: Date | string;
    stage?: string;
    status?: string;
    confidence?: number;
  },
>(items: T[], opts?: RankOptions): T[] {
  const preferMid = opts?.preferMidConfidence !== false;
  const minConfidence = opts?.minConfidence ?? 0;
  const maxConfidence = opts?.maxConfidence ?? 100;
  const { mid } = clampBand(minConfidence, maxConfidence);

  return [...items].sort((a, b) => {
    const aw = isWatching(a) ? 1 : 0;
    const bw = isWatching(b) ? 1 : 0;
    if (aw !== bw) return aw - bw;

    const ca = Number(a.confidence);
    const cb = Number(b.confidence);
    if (Number.isFinite(ca) && Number.isFinite(cb)) {
      if (preferMid) {
        const da = Math.abs(ca - mid);
        const db = Math.abs(cb - mid);
        if (da !== db) return da - db;
        if (ca !== cb) return ca - cb;
      } else if (cb !== ca) {
        return cb - ca;
      }
    }

    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

function persistStatus(o: Opportunity): SignalStatus {
  return o.stage === 'watching' ? SignalStatus.WATCHING : SignalStatus.RANKED;
}

async function upsertOpportunityDocs(
  userId: string,
  opps: Opportunity[],
  rankOpts?: RankOptions,
) {
  const triggered = opps.filter((o) => o.stage !== 'watching');
  const watching = opps.filter((o) => o.stage === 'watching');
  const ranked = [...rankOpportunities(triggered, rankOpts), ...watching];
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

function rankOptsFromSettings(settings?: {
  scanner?: {
    minConfidence?: number;
    maxConfidence?: number;
    preferMidConfidence?: boolean;
  } | null;
}): RankOptions {
  return {
    minConfidence: settings?.scanner?.minConfidence ?? 75,
    maxConfidence: settings?.scanner?.maxConfidence ?? 100,
    preferMidConfidence: settings?.scanner?.preferMidConfidence !== false,
  };
}

export async function persistOpportunities(
  userId: string,
  opps: Opportunity[],
  rankOpts?: RankOptions,
) {
  const { ranked, docs } = await upsertOpportunityDocs(userId, opps, rankOpts);

  await Signal.updateMany(leftoverActiveFilter(userId, ranked), {
    $set: { status: SignalStatus.EXPIRED },
  });

  return sortOpportunitiesForDisplay(docs, rankOpts);
}

/** Upsert opps for one symbol and expire only that symbol's leftover ranked/watching rows. */
export async function persistSymbolOpportunities(
  userId: string,
  symbol: string,
  opps: Opportunity[],
  rankOpts?: RankOptions,
) {
  const scoped = opps.filter((o) => o.symbol === symbol);
  const { ranked, docs } = await upsertOpportunityDocs(userId, scoped, rankOpts);

  await Signal.updateMany(leftoverActiveFilterForSymbol(userId, symbol, ranked), {
    $set: { status: SignalStatus.EXPIRED },
  });

  return sortOpportunitiesForDisplay(docs, rankOpts);
}

export async function listOpportunities(
  userId: string,
  filters?: {
    minConfidence?: number;
    maxConfidence?: number;
    timeframe?: string;
    side?: Side;
    search?: string;
    preferMidConfidence?: boolean;
  },
) {
  const q: Record<string, unknown> = {
    userId,
    status: { $in: [SignalStatus.RANKED, SignalStatus.WATCHING] },
    expiresAt: { $gt: new Date() },
  };
  const minC = filters?.minConfidence;
  const maxC = filters?.maxConfidence;
  if (minC != null || maxC != null) {
    const rankedConf: Record<string, number> = {};
    if (minC != null) rankedConf.$gte = minC;
    if (maxC != null && maxC < 100) rankedConf.$lte = maxC;
    q.$or = [
      { status: SignalStatus.WATCHING },
      {
        status: SignalStatus.RANKED,
        ...(Object.keys(rankedConf).length ? { confidence: rankedConf } : {}),
      },
    ];
  }
  if (filters?.timeframe) q.timeframe = filters.timeframe;
  if (filters?.side) q.side = filters.side;
  if (filters?.search) q.symbol = new RegExp(filters.search, 'i');
  const docs = await Signal.find(q).limit(100).lean();
  return sortOpportunitiesForDisplay(docs as Array<Record<string, unknown>>, {
    minConfidence: minC ?? 0,
    maxConfidence: maxC ?? 100,
    preferMidConfidence: filters?.preferMidConfidence !== false,
  });
}

export { rankOptsFromSettings };
