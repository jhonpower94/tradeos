import { describe, expect, it } from 'vitest';
import { Side, Timeframe, type Opportunity } from '@trading-os/shared';
import {
  hasOppositeTriggeredRelease,
  oppositeSide,
  shouldSuppressManualLoss,
} from '../src/modules/scanner/symbol-suppression.js';

function opp(partial: Partial<Opportunity> & Pick<Opportunity, 'symbol' | 'side'>): Opportunity {
  return {
    timeframe: Timeframe.H1,
    confidence: 80,
    entry: 100,
    stopLoss: 98,
    takeProfit: 104,
    riskReward: 2,
    strategyIds: [],
    primaryStrategy: 'ema_pullback' as Opportunity['primaryStrategy'],
    evidence: [],
    regime: 'trending_bull' as Opportunity['regime'],
    stage: 'triggered',
    ...partial,
  };
}

describe('oppositeSide', () => {
  it('maps BUY to SELL and SELL to BUY', () => {
    expect(oppositeSide(Side.BUY)).toBe(Side.SELL);
    expect(oppositeSide(Side.SELL)).toBe(Side.BUY);
  });
});

describe('hasOppositeTriggeredRelease', () => {
  it('returns true for opposite triggered opportunity', () => {
    const opps = [opp({ symbol: 'BTCUSDT', side: Side.SELL, stage: 'triggered' })];
    expect(hasOppositeTriggeredRelease(opps, Side.BUY)).toBe(true);
  });

  it('returns false for same-side triggered opportunity', () => {
    const opps = [opp({ symbol: 'BTCUSDT', side: Side.BUY, stage: 'triggered' })];
    expect(hasOppositeTriggeredRelease(opps, Side.BUY)).toBe(false);
  });

  it('returns false for opposite watching-only opportunity', () => {
    const opps = [opp({ symbol: 'BTCUSDT', side: Side.SELL, stage: 'watching' })];
    expect(hasOppositeTriggeredRelease(opps, Side.BUY)).toBe(false);
  });
});

describe('shouldSuppressManualLoss', () => {
  it('suppresses manual close with negative pnl when enabled', () => {
    expect(shouldSuppressManualLoss('Manual close', -10, true)).toBe(true);
    expect(shouldSuppressManualLoss('Manual close', -10, undefined)).toBe(true);
  });

  it('does not suppress winning manual close', () => {
    expect(shouldSuppressManualLoss('Manual close', 5, true)).toBe(false);
  });

  it('does not suppress when setting disabled', () => {
    expect(shouldSuppressManualLoss('Manual close', -10, false)).toBe(false);
  });

  it('does not suppress non-manual exits', () => {
    expect(shouldSuppressManualLoss('Stop loss hit', -10, true)).toBe(false);
  });
});
