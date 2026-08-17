import { describe, expect, it } from 'vitest';
import { leftoverActiveFilter, rankOpportunities, sortTriggeredThenNewest } from '../src/modules/ranking/index.js';
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

describe('leftoverActiveFilter', () => {
  it('expires every ranked and watching row when the current scan is empty', () => {
    expect(leftoverActiveFilter('user-1', [])).toEqual({
      userId: 'user-1',
      status: { $in: ['ranked', 'watching'] },
    });
  });

  it('excludes current-scan symbol/timeframe/side from expiry', () => {
    const filter = leftoverActiveFilter('user-1', [
      { symbol: 'BTCUSDT', timeframe: '1h', side: 'BUY' },
    ]);
    expect(filter.userId).toBe('user-1');
    expect(filter.status).toEqual({ $in: ['ranked', 'watching'] });
    expect(filter.$nor).toEqual([{ symbol: 'BTCUSDT', timeframe: '1h', side: 'BUY' }]);
  });
});

describe('sortTriggeredThenNewest', () => {
  it('puts triggered rows above watching, then newest createdAt', () => {
    const ordered = sortTriggeredThenNewest([
      { symbol: 'OLDWATCH', stage: 'watching', createdAt: new Date('2026-08-17T11:00:00Z') },
      { symbol: 'NEWTRIG', stage: 'triggered', createdAt: new Date('2026-08-17T10:00:00Z') },
      { symbol: 'OLDTRIG', status: 'ranked', createdAt: new Date('2026-08-17T08:00:00Z') },
    ]);
    expect(ordered.map((o) => o.symbol)).toEqual(['NEWTRIG', 'OLDTRIG', 'OLDWATCH']);
  });
});
