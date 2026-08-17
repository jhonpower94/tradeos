export function createdAtMs(value: unknown): number {
  if (!value) return 0;
  const t = new Date(value as string | number | Date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function isWatchingRow(row: Record<string, unknown>): boolean {
  return row.status === 'watching' || row.stage === 'watching';
}

/** Triggered first, then newest createdAt. */
export function sortTriggeredThenNewest<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aw = isWatchingRow(a) ? 1 : 0;
    const bw = isWatchingRow(b) ? 1 : 0;
    if (aw !== bw) return aw - bw;
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
