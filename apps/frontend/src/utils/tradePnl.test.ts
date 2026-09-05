import { describe, expect, it } from 'vitest';
import { openTradeDisplayPnl, positionByTradeId } from './tradePnl';

describe('openTradeDisplayPnl', () => {
  it('sums realized and unrealized for open display', () => {
    expect(openTradeDisplayPnl(12.5, -3.2)).toBeCloseTo(9.3);
    expect(openTradeDisplayPnl(undefined, 4)).toBe(4);
    expect(openTradeDisplayPnl(5, undefined)).toBe(5);
  });
});

describe('positionByTradeId', () => {
  it('indexes open positions by tradeId', () => {
    const map = positionByTradeId([
      { _id: 'p1', tradeId: 't1', unrealizedPnl: 1 },
      { _id: 'p2', tradeId: 't2', unrealizedPnl: -2 },
    ]);
    expect(map.get('t1')?.unrealizedPnl).toBe(1);
    expect(map.get('t2')?.unrealizedPnl).toBe(-2);
    expect(map.get('missing')).toBeUndefined();
  });
});
