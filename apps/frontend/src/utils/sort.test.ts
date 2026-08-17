import { describe, expect, it } from 'vitest';
import { sortByRankThenConfidence, sortNewestFirst } from './sort';

describe('sortNewestFirst', () => {
  it('puts newest createdAt first', () => {
    const ordered = sortNewestFirst([
      { symbol: 'OLD', createdAt: '2026-08-17T08:00:00Z' },
      { symbol: 'NEW', createdAt: '2026-08-17T10:00:00Z' },
      { symbol: 'MID', createdAt: '2026-08-17T09:00:00Z' },
    ]);
    expect(ordered.map((o) => o.symbol)).toEqual(['NEW', 'MID', 'OLD']);
  });

  it('keeps original order when createdAt is missing', () => {
    const ordered = sortNewestFirst([{ symbol: 'A' }, { symbol: 'B' }, { symbol: 'C' }]);
    expect(ordered.map((o) => o.symbol)).toEqual(['A', 'B', 'C']);
  });
});

describe('sortByRankThenConfidence', () => {
  it('sorts by rank then confidence', () => {
    const ordered = sortByRankThenConfidence([
      { symbol: 'LOW', rank: 3, confidence: 60 },
      { symbol: 'HIGH', rank: 1, confidence: 95 },
      { symbol: 'MID', rank: 2, confidence: 80 },
    ]);
    expect(ordered.map((o) => o.symbol)).toEqual(['HIGH', 'MID', 'LOW']);
  });
});
