import { PositionStatus } from '@trading-os/shared';
import { Position } from '../../models/Position.js';
import { JournalEntry } from '../../models/JournalEntry.js';
import { PaperLedger } from '../../models/PaperLedger.js';
import { getRawSettings } from '../settings/index.js';
import { AppError } from '../../utils/errors.js';

export const DEFAULT_PAPER_STARTING_BALANCE = 10_000;

export interface PaperEquityBreakdown {
  equity: number;
  freeQuote: number;
  startingBalance: number;
  realizedPnl: number;
  adjustmentsNet: number;
  unrealizedPnl: number;
  deployed: number;
}

/** Pure combiner for tests and shared math. */
export function computePaperEquity(input: {
  startingBalance: number;
  adjustmentsNet: number;
  realizedPnl: number;
  unrealizedPnl: number;
  deployed: number;
}): PaperEquityBreakdown {
  const startingBalance = Math.max(0, input.startingBalance);
  const equity = startingBalance + input.adjustmentsNet + input.realizedPnl + input.unrealizedPnl;
  const freeQuote = Math.max(0, equity - Math.max(0, input.deployed));
  return {
    equity,
    freeQuote,
    startingBalance,
    realizedPnl: input.realizedPnl,
    adjustmentsNet: input.adjustmentsNet,
    unrealizedPnl: input.unrealizedPnl,
    deployed: Math.max(0, input.deployed),
  };
}

export async function getPaperEquity(userId: string): Promise<PaperEquityBreakdown> {
  const settings = await getRawSettings(userId);
  const startingBalance =
    typeof settings.trading?.paperStartingBalance === 'number'
      ? settings.trading.paperStartingBalance
      : DEFAULT_PAPER_STARTING_BALANCE;

  const [journalEntries, ledgerEntries, positions] = await Promise.all([
    JournalEntry.find({ userId }).select('pnl').lean(),
    PaperLedger.find({ userId }).select('type amount').lean(),
    Position.find({ userId, status: PositionStatus.OPEN }).lean(),
  ]);

  const realizedPnl = journalEntries.reduce((a, e) => a + (e.pnl ?? 0), 0);
  const adjustmentsNet = ledgerEntries.reduce((a, e) => {
    const amt = e.amount ?? 0;
    return a + (e.type === 'deposit' ? amt : -amt);
  }, 0);
  const unrealizedPnl = positions.reduce((a, p) => a + (p.unrealizedPnl ?? 0), 0);
  const deployed = positions.reduce((a, p) => a + p.qty * p.entryPrice, 0);

  return computePaperEquity({
    startingBalance,
    adjustmentsNet,
    realizedPnl,
    unrealizedPnl,
    deployed,
  });
}

export async function depositPaper(
  userId: string,
  amount: number,
  note?: string,
): Promise<PaperEquityBreakdown> {
  if (!(amount > 0)) throw new AppError('INVALID_AMOUNT', 'Deposit amount must be positive', 400);
  await PaperLedger.create({
    userId,
    type: 'deposit',
    amount,
    note,
  });
  return getPaperEquity(userId);
}

export async function withdrawPaper(
  userId: string,
  amount: number,
  note?: string,
): Promise<PaperEquityBreakdown> {
  if (!(amount > 0)) throw new AppError('INVALID_AMOUNT', 'Withdraw amount must be positive', 400);
  const current = await getPaperEquity(userId);
  assertCanWithdraw(current.freeQuote, amount);
  await PaperLedger.create({
    userId,
    type: 'withdraw',
    amount,
    note,
  });
  return getPaperEquity(userId);
}

export async function listPaperLedger(userId: string, limit = 50) {
  return PaperLedger.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

/** Guard used by tests and withdrawPaper. */
export function assertCanWithdraw(freeQuote: number, amount: number): void {
  if (!(amount > 0)) throw new AppError('INVALID_AMOUNT', 'Withdraw amount must be positive', 400);
  if (amount > freeQuote) {
    throw new AppError(
      'INSUFFICIENT_FREE',
      `Insufficient free balance (free ${freeQuote.toFixed(2)}, requested ${amount.toFixed(2)})`,
      400,
    );
  }
}
