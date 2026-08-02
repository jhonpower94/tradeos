import { Side } from '@trading-os/shared';
import { JournalEntry } from '../../models/JournalEntry.js';
import { Signal } from '../../models/Signal.js';
import type { TradeDoc } from '../../models/Trade.js';
import type { PositionDoc } from '../../models/Position.js';

export async function createJournalFromTrade(
  trade: TradeDoc,
  position: PositionDoc,
  exitReason: string,
) {
  const signal = trade.signalId ? await Signal.findById(trade.signalId).lean() : null;
  const pnl = trade.realizedPnl ?? 0;
  const durationMs =
    trade.openedAt && trade.closedAt
      ? new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime()
      : undefined;

  return JournalEntry.create({
    userId: trade.userId,
    tradeId: trade._id,
    signalId: trade.signalId,
    symbol: trade.symbol,
    side: trade.side,
    strategy: signal?.primaryStrategy,
    strategyIds: signal?.strategyIds,
    indicators: signal?.consensusSnapshot,
    patterns: signal?.evidence,
    entry: trade.entryPrice,
    exit: trade.exitPrice,
    qty: trade.qty,
    profit: pnl > 0 ? pnl : 0,
    loss: pnl < 0 ? Math.abs(pnl) : 0,
    pnl,
    durationMs,
    risk: trade.stopLoss && trade.entryPrice
      ? Math.abs(trade.entryPrice - trade.stopLoss) * trade.qty
      : undefined,
    confidence: signal?.confidence,
    riskReward: signal?.riskReward,
    entryReason: trade.entryReason,
    exitReason,
    timeframe: signal?.timeframe,
    mode: trade.mode,
  });
}

export async function listJournal(userId: string, limit = 100) {
  return JournalEntry.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
}

export async function getJournalEntry(userId: string, id: string) {
  return JournalEntry.findOne({ _id: id, userId }).lean();
}

void Side;
