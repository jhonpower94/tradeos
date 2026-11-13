import { describe, expect, it } from 'vitest';
import {
  sortByRankThenConfidence,
  sortOpportunitiesForDisplay,
  sortTriggeredThenNewest,
} from './sort';

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

describe('sortOpportunitiesForDisplay', () => {
  it('prefers mid-band among triggered when ranks are absent', () => {
    const ordered = sortOpportunitiesForDisplay(
      [
        { symbol: 'WATCH', status: 'watching', confidence: 40, createdAt: '2026-08-17T12:00:00Z' },
        { symbol: 'HIGH', status: 'ranked', confidence: 90, createdAt: '2026-08-17T11:00:00Z' },
        { symbol: 'MID', status: 'ranked', confidence: 55, createdAt: '2026-08-17T10:00:00Z' },
      ],
      { minConfidence: 50, maxConfidence: 59, preferMidConfidence: true },
    );
    expect(ordered.map((o) => o.symbol)).toEqual(['MID', 'HIGH', 'WATCH']);
  });
});
