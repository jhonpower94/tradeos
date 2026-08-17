import { describe, expect, it } from 'vitest';
import { leftoverRankedFilter, rankOpportunities, sortByCreatedAtDesc } from '../src/modules/ranking/index.js';
import { Side, Timeframe, type Opportunity } from '@trading-os/shared';

function opp(partial: Partial<Opportunity> & Pick<Opportunity, 'symbol' | 'confidence'>): Opportunity {
  return {
    timeframe: Timeframe.M15,
    side: Side.BUY,
    entry: 100,
    stopLoss: 98,
    takeProfit: 104,
    riskReward: 2,
    strategyIds: [],
    primaryStrategy: 'ema_pullback' as Opportunity['primaryStrategy'],
    evidence: [],
    regime: 'trending_bull' as Opportunity['regime'],
    ...partial,
  };
}

describe('rankOpportunities', () => {
  it('sorts by confidence descending', () => {
    const ranked = rankOpportunities([
      opp({ symbol: 'LOWUSDT', confidence: 60 }),
      opp({ symbol: 'HIGHUSDT', confidence: 95 }),
      opp({ symbol: 'MIDUSDT', confidence: 80 }),
    ]);
    expect(ranked.map((o) => o.symbol)).toEqual(['HIGHUSDT', 'MIDUSDT', 'LOWUSDT']);
    expect(ranked.map((o) => o.rank)).toEqual([1, 2, 3]);
  });

  it('breaks confidence ties with early-pack voter count then symbol', () => {
    const ranked = rankOpportunities([
      opp({
        symbol: 'ZUSDT',
        confidence: 80,
        strategyIds: ['supertrend'] as Opportunity['strategyIds'],
      }),
      opp({
        symbol: 'AUSDT',
        confidence: 80,
        strategyIds: ['ema_pullback', 'order_block'] as Opportunity['strategyIds'],
      }),
      opp({
        symbol: 'BUSDT',
        confidence: 80,
        strategyIds: ['ema_pullback'] as Opportunity['strategyIds'],
      }),
    ]);
    expect(ranked.map((o) => o.symbol)).toEqual(['AUSDT', 'BUSDT', 'ZUSDT']);
    expect(ranked.map((o) => o.rank)).toEqual([1, 2, 3]);
  });
});

describe('list order contract', () => {
  it('sorts newest createdAt first even when rank is inverted', () => {
    const newest = { symbol: 'NEWUSDT', rank: 3, createdAt: new Date('2026-08-17T10:00:00Z') };
    const oldest = { symbol: 'OLDUSDT', rank: 1, createdAt: new Date('2026-08-17T08:00:00Z') };
    const mid = { symbol: 'MIDUSDT', rank: 2, createdAt: new Date('2026-08-17T09:00:00Z') };
    const ordered = sortByCreatedAtDesc([oldest, newest, mid]);
    expect(ordered.map((o) => o.symbol)).toEqual(['NEWUSDT', 'MIDUSDT', 'OLDUSDT']);
    expect(ordered.map((o) => o.rank)).toEqual([3, 2, 1]);
  });
});

describe('leftoverRankedFilter', () => {
  it('expires every ranked row when the current scan is empty', () => {
    expect(leftoverRankedFilter('user-1', [])).toEqual({
      userId: 'user-1',
      status: 'ranked',
    });
  });

  it('excludes current-scan symbol/timeframe/side from expiry', () => {
    const filter = leftoverRankedFilter('user-1', [
      { symbol: 'BTCUSDT', timeframe: '1h', side: 'BUY' },
    ]);
    expect(filter.userId).toBe('user-1');
    expect(filter.status).toBe('ranked');
    expect(filter.$nor).toEqual([{ symbol: 'BTCUSDT', timeframe: '1h', side: 'BUY' }]);
  });
});
