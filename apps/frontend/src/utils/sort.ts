export function createdAtMs(value: unknown): number {
  if (!value) return 0;
  const t = new Date(value as string | number | Date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function isWatchingRow(row: Record<string, unknown>): boolean {
  return row.status === 'watching' || row.stage === 'watching';
}

export type OpportunityDisplaySortOpts = {
  minConfidence?: number;
  maxConfidence?: number;
  preferMidConfidence?: boolean;
};

/** Triggered first, then newest createdAt. */
export function sortTriggeredThenNewest<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aw = isWatchingRow(a) ? 1 : 0;
    const bw = isWatchingRow(b) ? 1 : 0;
    if (aw !== bw) return aw - bw;
    return createdAtMs(b.createdAt) - createdAtMs(a.createdAt);
  });
}

/**
 * Triggered first, then stored rank, then mid-band (or classic confidence), then newest.
 * Mirrors backend sortOpportunitiesForDisplay.
 */
export function sortOpportunitiesForDisplay<T extends Record<string, unknown>>(
  rows: T[],
  opts?: OpportunityDisplaySortOpts,
): T[] {
  const preferMid = opts?.preferMidConfidence !== false;
  const lo = Math.min(opts?.minConfidence ?? 0, opts?.maxConfidence ?? 100);
  const hi = Math.max(opts?.minConfidence ?? 0, opts?.maxConfidence ?? 100);
  const mid = (lo + hi) / 2;

  return [...rows].sort((a, b) => {
    const aw = isWatchingRow(a) ? 1 : 0;
    const bw = isWatchingRow(b) ? 1 : 0;
    if (aw !== bw) return aw - bw;

    const rankA = Number(a.rank);
    const rankB = Number(b.rank);
    const aHasRank = Number.isFinite(rankA);
    const bHasRank = Number.isFinite(rankB);
    if (aHasRank && bHasRank && rankA !== rankB) return rankA - rankB;
    if (aHasRank !== bHasRank) return aHasRank ? -1 : 1;

    const ca = Number(a.confidence ?? 0);
    const cb = Number(b.confidence ?? 0);
    if (preferMid) {
      const da = Math.abs(ca - mid);
      const db = Math.abs(cb - mid);
      if (da !== db) return da - db;
      if (ca !== cb) return ca - cb;
    } else if (cb !== ca) {
      return cb - ca;
    }
    return createdAtMs(b.createdAt) - createdAtMs(a.createdAt);
  });
}

/** Quality rank ASC, then confidence DESC. Missing rank sorts last. */
export function sortByRankThenConfidence<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const rankA = Number(a.rank);
    const rankB = Number(b.rank);
    const aHasRank = Number.isFinite(rankA);
    const bHasRank = Number.isFinite(rankB);
    if (aHasRank && bHasRank && rankA !== rankB) return rankA - rankB;
    if (aHasRank !== bHasRank) return aHasRank ? -1 : 1;
    return Number(b.confidence ?? 0) - Number(a.confidence ?? 0);
  });
}
