import { describe, it, expect } from 'vitest';
import { Side, Timeframe, type Opportunity } from '@trading-os/shared';
import { rankOpportunities } from '../src/modules/ranking/index.js';

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
