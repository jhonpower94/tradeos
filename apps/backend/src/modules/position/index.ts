import { PositionStatus, Side } from '@trading-os/shared';
import { Position } from '../../models/Position.js';
import { getTickerPrice } from '../market-data/index.js';
import { closePosition } from '../trade/index.js';
import { AppError } from '../../utils/errors.js';

export function calcUnrealizedPnl(
  side: Side,
  entry: number,
  current: number,
  qty: number,
): number {
  const dir = side === Side.BUY ? 1 : -1;
  return (current - entry) * qty * dir;
}

export async function markPositions(userId?: string) {
  const q: Record<string, unknown> = { status: PositionStatus.OPEN };
  if (userId) q.userId = userId;
  const positions = await Position.find(q);
  for (const p of positions) {
    const price = getTickerPrice(p.symbol) ?? p.currentPrice;
    p.currentPrice = price;
    p.unrealizedPnl = calcUnrealizedPnl(p.side as Side, p.entryPrice, price, p.qty);
    p.highestPrice = Math.max(p.highestPrice ?? price, price);
    p.lowestPrice = Math.min(p.lowestPrice ?? price, price);

    if (p.trailingStopPct && p.trailingStopPct > 0) {
      if (p.side === Side.BUY) {
        p.trailingStopPrice = (p.highestPrice ?? price) * (1 - p.trailingStopPct / 100);
      } else {
        p.trailingStopPrice = (p.lowestPrice ?? price) * (1 + p.trailingStopPct / 100);
      }
    }
    await p.save();
  }
  return positions;
}

export async function checkExits() {
  const positions = await Position.find({ status: PositionStatus.OPEN });
  for (const p of positions) {
    const price = getTickerPrice(p.symbol) ?? p.currentPrice;
    let reason: string | null = null;

    if (p.side === Side.BUY) {
      if (p.stopLoss != null && price <= p.stopLoss) reason = 'Stop loss hit';
      else if (p.takeProfit != null && price >= p.takeProfit) reason = 'Take profit hit';
      else if (p.trailingStopPrice != null && price <= p.trailingStopPrice) reason = 'Trailing stop hit';
    } else {
      if (p.stopLoss != null && price >= p.stopLoss) reason = 'Stop loss hit';
      else if (p.takeProfit != null && price <= p.takeProfit) reason = 'Take profit hit';
      else if (p.trailingStopPrice != null && price >= p.trailingStopPrice) reason = 'Trailing stop hit';
    }

    if (reason) {
      try {
        await closePosition(String(p.userId), String(p._id), reason, price);
      } catch {
        // continue
      }
    }
  }
}

export async function listPositions(userId: string, status?: PositionStatus) {
  const q: Record<string, unknown> = { userId };
  if (status) q.status = status;
  return Position.find(q).sort({ openedAt: -1 }).lean();
}

export async function updatePositionLevels(
  userId: string,
  positionId: string,
  patch: { stopLoss?: number; takeProfit?: number; trailingStopPct?: number },
) {
  const p = await Position.findOneAndUpdate(
    { _id: positionId, userId, status: PositionStatus.OPEN },
    { $set: patch },
    { new: true },
  );
  if (!p) throw new AppError('NOT_FOUND', 'Position not found', 404);
  return p;
}
