import { describe, it, expect } from 'vitest';
import {
  assertCanWithdraw,
  computePaperEquity,
} from '../src/modules/portfolio/paper-equity.js';
import { AppError } from '../src/utils/errors.js';

describe('paper equity', () => {
  it('includes realized PnL on top of starting balance', () => {
    const r = computePaperEquity({
      startingBalance: 10_000,
      adjustmentsNet: 0,
      realizedPnl: 463,
      unrealizedPnl: 0,
      deployed: 0,
    });
    expect(r.equity).toBe(10_463);
    expect(r.freeQuote).toBe(10_463);
  });

  it('deposit increases equity and freeQuote', () => {
    const r = computePaperEquity({
      startingBalance: 10_000,
      adjustmentsNet: 1_000,
      realizedPnl: 0,
      unrealizedPnl: 0,
      deployed: 0,
    });
    expect(r.equity).toBe(11_000);
    expect(r.freeQuote).toBe(11_000);
    expect(r.adjustmentsNet).toBe(1_000);
  });

  it('subtracts deployed notional from freeQuote', () => {
    const r = computePaperEquity({
      startingBalance: 10_000,
      adjustmentsNet: 0,
      realizedPnl: 463,
      unrealizedPnl: 50,
      deployed: 2_000,
    });
    expect(r.equity).toBe(10_513);
    expect(r.freeQuote).toBe(8_513);
  });

  it('rejects withdraw above freeQuote', () => {
    expect(() => assertCanWithdraw(500, 501)).toThrow(AppError);
    try {
      assertCanWithdraw(500, 501);
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INSUFFICIENT_FREE');
    }
  });

  it('allows withdraw within freeQuote', () => {
    expect(() => assertCanWithdraw(500, 500)).not.toThrow();
  });
});
