import { describe, expect, it } from 'vitest';
import {
  consensusToOpportunity,
  leftoverActiveFilter,
  leftoverActiveFilterForSymbol,
  rankOpportunities,
  resolveOpportunityListFilters,
  sortOpportunitiesForDisplay,
  sortTriggeredThenNewest,
} from '../src/modules/ranking/index.js';
import {
  DEFAULT_SCANNER_SETTINGS,
  Side,
  Timeframe,
  type ConsensusResult,
  type Opportunity,
} from '@trading-os/shared';

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

describe('consensusToOpportunity', () => {
  const base: ConsensusResult = {
    side: Side.BUY,
    score: 55,
    veto: false,
    entry: 100,
    stopLoss: 98,
    takeProfit: 104,
    riskReward: 2,
    strategyIds: ['resistance_rejection'],
    primaryStrategy: 'resistance_rejection',
    evidence: [],
    regime: 'ranging',
  };

  it('accepts scores inside [min, max]', () => {
    expect(consensusToOpportunity('BTCUSDT', Timeframe.H1, base, 50, 59)?.confidence).toBe(55);
  });

  it('rejects scores above maxConfidence', () => {
    expect(consensusToOpportunity('BTCUSDT', Timeframe.H1, { ...base, score: 65 }, 50, 59)).toBeNull();
  });
});

describe('rankOpportunities', () => {
  it('prefers mid-band confidence by default (nearest midpoint of [min,max])', () => {
    const ranked = rankOpportunities(
      [
        opp({ symbol: 'HIGHUSDT', confidence: 95 }),
        opp({ symbol: 'MIDUSDT', confidence: 55 }),
        opp({ symbol: 'LOWUSDT', confidence: 50 }),
      ],
      { minConfidence: 50, maxConfidence: 59 },
    );
    // mid = 54.5 → 55, then 50, then 95
    expect(ranked.map((o) => o.symbol)).toEqual(['MIDUSDT', 'LOWUSDT', 'HIGHUSDT']);
    expect(ranked.map((o) => o.rank)).toEqual([1, 2, 3]);
  });

  it('sorts by confidence descending when preferMidConfidence is false', () => {
    const ranked = rankOpportunities(
      [
        opp({ symbol: 'LOWUSDT', confidence: 60 }),
        opp({ symbol: 'HIGHUSDT', confidence: 95 }),
        opp({ symbol: 'MIDUSDT', confidence: 80 }),
      ],
      { preferMidConfidence: false },
    );
    expect(ranked.map((o) => o.symbol)).toEqual(['HIGHUSDT', 'MIDUSDT', 'LOWUSDT']);
    expect(ranked.map((o) => o.rank)).toEqual([1, 2, 3]);
  });

  it('breaks confidence ties with early-pack voter count then symbol', () => {
    const ranked = rankOpportunities(
      [
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
      ],
      { preferMidConfidence: false },
    );
    expect(ranked.map((o) => o.symbol)).toEqual(['AUSDT', 'BUSDT', 'ZUSDT']);
    expect(ranked.map((o) => o.rank)).toEqual([1, 2, 3]);
  });
});

describe('sortOpportunitiesForDisplay', () => {
  it('keeps triggered above watching and prefers mid-band among triggered', () => {
    const ordered = sortOpportunitiesForDisplay(
      [
        { symbol: 'WATCH', stage: 'watching', confidence: 49, createdAt: new Date('2026-08-17T12:00:00Z') },
        { symbol: 'HIGH', stage: 'triggered', confidence: 90, createdAt: new Date('2026-08-17T11:00:00Z') },
        { symbol: 'MID', status: 'ranked', confidence: 55, createdAt: new Date('2026-08-17T10:00:00Z') },
      ],
      { minConfidence: 50, maxConfidence: 59, preferMidConfidence: true },
    );
    expect(ordered.map((o) => o.symbol)).toEqual(['MID', 'HIGH', 'WATCH']);
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

describe('leftoverActiveFilterForSymbol', () => {
  it('always scopes expiry to the given symbol', () => {
    const filter = leftoverActiveFilterForSymbol('user-1', 'BTCUSDT', []);
    expect(filter).toEqual({
      userId: 'user-1',
      symbol: 'BTCUSDT',
      status: { $in: ['ranked', 'watching'] },
    });
  });

  it('does not include other symbols in the filter so they cannot be expired', () => {
    const filter = leftoverActiveFilterForSymbol('user-1', 'BTCUSDT', [
      { symbol: 'BTCUSDT', timeframe: '1h', side: 'BUY' },
      { symbol: 'ETHUSDT', timeframe: '1h', side: 'BUY' },
    ]);
    expect(filter.symbol).toBe('BTCUSDT');
    expect(filter.userId).toBe('user-1');
    expect(filter.$nor).toEqual([{ symbol: 'BTCUSDT', timeframe: '1h', side: 'BUY' }]);
    expect(JSON.stringify(filter)).not.toContain('ETHUSDT');
  });

  it('expires all TF/side variants for the symbol when current batch is empty', () => {
    const filter = leftoverActiveFilterForSymbol('user-1', 'SOLUSDT', [
      { symbol: 'ETHUSDT', timeframe: '15m', side: 'SELL' },
    ]);
    expect(filter.symbol).toBe('SOLUSDT');
    expect(filter.$nor).toBeUndefined();
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

describe('resolveOpportunityListFilters', () => {
  it('defaults view filters to ALL and uses scanner confidence', () => {
    expect(DEFAULT_SCANNER_SETTINGS.viewSide).toBe('ALL');
    expect(DEFAULT_SCANNER_SETTINGS.viewStage).toBe('ALL');
    expect(DEFAULT_SCANNER_SETTINGS.viewTimeframe).toBe('ALL');
    const f = resolveOpportunityListFilters(DEFAULT_SCANNER_SETTINGS);
    expect(f.side).toBeUndefined();
    expect(f.stage).toBeUndefined();
    expect(f.timeframe).toBeUndefined();
    expect(f.minConfidence).toBe(DEFAULT_SCANNER_SETTINGS.minConfidence);
    expect(f.maxConfidence).toBe(DEFAULT_SCANNER_SETTINGS.maxConfidence);
  });

  it('maps viewSide/viewStage/viewTimeframe into list filters', () => {
    const f = resolveOpportunityListFilters({
      ...DEFAULT_SCANNER_SETTINGS,
      viewSide: 'SELL',
      viewStage: 'triggered',
      viewTimeframe: Timeframe.H1,
    });
    expect(f.side).toBe(Side.SELL);
    expect(f.stage).toBe('triggered');
    expect(f.timeframe).toBe('1h');
  });

  it('lets query params override settings view filters', () => {
    const f = resolveOpportunityListFilters(
      {
        ...DEFAULT_SCANNER_SETTINGS,
        viewSide: 'SELL',
        viewStage: 'watching',
        viewTimeframe: Timeframe.H4,
      },
      { side: Side.BUY, stage: 'triggered', timeframe: '15m', minConfidence: 40 },
    );
    expect(f.side).toBe(Side.BUY);
    expect(f.stage).toBe('triggered');
    expect(f.timeframe).toBe('15m');
    expect(f.minConfidence).toBe(40);
  });
});
