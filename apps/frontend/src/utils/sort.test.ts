import { describe, expect, it } from 'vitest';
import { sortByRankThenConfidence, sortTriggeredThenNewest } from './sort';

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

describe('sortTriggeredThenNewest', () => {
  it('puts triggered above watching', () => {
    const ordered = sortTriggeredThenNewest([
      { symbol: 'WATCH', status: 'watching', createdAt: '2026-08-17T12:00:00Z' },
      { symbol: 'TRIG', status: 'ranked', createdAt: '2026-08-17T09:00:00Z' },
    ]);
    expect(ordered.map((o) => o.symbol)).toEqual(['TRIG', 'WATCH']);
  });
});
