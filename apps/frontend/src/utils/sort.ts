export function createdAtMs(value: unknown): number {
  if (!value) return 0;
  const t = new Date(value as string | number | Date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Newest first-appearance first. Missing createdAt stays at the bottom (stable). */
export function sortNewestFirst<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => createdAtMs(b.createdAt) - createdAtMs(a.createdAt));
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
