import { describe, it, expect } from 'vitest';
import {
  assertCanWithdraw,
  computePaperEquity,
  DEFAULT_PAPER_STARTING_BALANCE,
} from '../src/modules/portfolio/paper-equity.js';
import { AppError } from '../src/utils/errors.js';

describe('paper equity', () => {
  it('defaults starting balance to zero', () => {
    expect(DEFAULT_PAPER_STARTING_BALANCE).toBe(0);
  });

  it('starts at zero until funded via ledger deposit', () => {
    const empty = computePaperEquity({
      startingBalance: 0,
      adjustmentsNet: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      deployed: 0,
    });
    expect(empty.equity).toBe(0);
    expect(empty.freeQuote).toBe(0);

    const funded = computePaperEquity({
      startingBalance: 0,
      adjustmentsNet: 10_000,
      realizedPnl: 0,
      unrealizedPnl: 0,
      deployed: 0,
    });
    expect(funded.equity).toBe(10_000);
    expect(funded.freeQuote).toBe(10_000);
    expect(funded.adjustmentsNet).toBe(10_000);
  });

  it('treats migrated starting balance as ledger deposit (equity-equivalent)', () => {
    const legacy = computePaperEquity({
      startingBalance: 10_000,
      adjustmentsNet: 0,
      realizedPnl: 463,
      unrealizedPnl: 0,
      deployed: 0,
    });
    const migrated = computePaperEquity({
      startingBalance: 0,
      adjustmentsNet: 10_000,
      realizedPnl: 463,
      unrealizedPnl: 0,
      deployed: 0,
    });
    expect(migrated.equity).toBe(legacy.equity);
    expect(migrated.freeQuote).toBe(legacy.freeQuote);
    expect(migrated.equity).toBe(10_463);
  });

  it('includes realized PnL on top of funded balance', () => {
    const r = computePaperEquity({
      startingBalance: 0,
      adjustmentsNet: 10_000,
      realizedPnl: 463,
      unrealizedPnl: 0,
      deployed: 0,
    });
    expect(r.equity).toBe(10_463);
    expect(r.freeQuote).toBe(10_463);
  });

  it('deposit increases equity and freeQuote', () => {
    const r = computePaperEquity({
      startingBalance: 0,
      adjustmentsNet: 1_000,
      realizedPnl: 0,
      unrealizedPnl: 0,
      deployed: 0,
    });
    expect(r.equity).toBe(1_000);
    expect(r.freeQuote).toBe(1_000);
    expect(r.adjustmentsNet).toBe(1_000);
  });

  it('subtracts deployed notional from freeQuote', () => {
    const r = computePaperEquity({
      startingBalance: 0,
      adjustmentsNet: 10_000,
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
