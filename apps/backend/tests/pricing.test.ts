import { describe, it, expect } from 'vitest';
import { Side } from '@trading-os/shared';
import {
  calcGrossPnl,
  calcNetPnl,
  estimateExitFee,
  fillPriceFromOrder,
} from '../src/modules/trade/pricing.js';

describe('pricing helpers', () => {
  it('calcGrossPnl for BUY and SELL', () => {
    expect(calcGrossPnl(Side.BUY, 100, 110, 2)).toBe(20);
    expect(calcGrossPnl(Side.SELL, 100, 90, 2)).toBe(20);
    expect(calcGrossPnl(Side.BUY, 100, 90, 1)).toBe(-10);
  });

  it('calcNetPnl subtracts exit fee (matches close formula)', () => {
    const feeRate = 0.001;
    const net = calcNetPnl(Side.BUY, 100, 110, 2, feeRate);
    const fee = estimateExitFee(110, 2, feeRate);
    expect(fee).toBeCloseTo(0.22, 8);
    expect(net).toBeCloseTo(20 - 0.22, 8);
  });

  it('fillPriceFromOrder uses average fill', () => {
    expect(
      fillPriceFromOrder({ executedQty: 2, cummulativeQuoteQty: 220 }),
    ).toBe(110);
    expect(fillPriceFromOrder({ executedQty: 0, cummulativeQuoteQty: 0 })).toBeNull();
  });

  it('net uPnL at mark equals close PnL at same mark', () => {
    const feeRate = 0.001;
    const entry = 50;
    const mark = 51;
    const qty = 10;
    const upnl = calcNetPnl(Side.BUY, entry, mark, qty, feeRate);
    const closePnl = calcGrossPnl(Side.BUY, entry, mark, qty) - mark * qty * feeRate;
    expect(upnl).toBe(closePnl);
  });
});
