import { PositionStatus, Side, NotificationType } from '@trading-os/shared';
import { Position } from '../../models/Position.js';
import { Trade } from '../../models/Trade.js';
import { getTickerPrice } from '../market-data/index.js';
import { closePosition, partialClosePosition } from '../trade/index.js';
import { calcNetPnl } from '../trade/pricing.js';
import { getRawSettings } from '../settings/index.js';
import { AppError } from '../../utils/errors.js';
import { config } from '../../config/index.js';
import { notify } from '../notifications/index.js';
import { shouldNotifyProfitHigh, shouldNotifyProfitLow } from './profit-high.js';

export function calcUnrealizedPnl(
  side: Side,
  entry: number,
  current: number,
  qty: number,
): number {
  const dir = side === Side.BUY ? 1 : -1;
  return (current - entry) * qty * dir;
}

/** Signed R-multiple vs initial risk distance. */
export function calcRMultiple(input: {
  side: Side;
  entry: number;
  price: number;
  initialStopLoss?: number | null;
  stopLoss?: number | null;
}): number | null {
  const sl = input.initialStopLoss ?? input.stopLoss;
  if (sl == null || !(input.entry > 0)) return null;
  const riskDist = Math.abs(input.entry - sl);
  if (!(riskDist > 0)) return null;
  const dir = input.side === Side.BUY ? 1 : -1;
  return (dir * (input.price - input.entry)) / riskDist;
}

export type ExitManageDecision =
  | { action: 'none' }
  | { action: 'partial'; fraction: number; armTrailing: boolean; trailingStopPct: number; breakeven: boolean }
  | { action: 'arm_trailing'; trailingStopPct: number }
  | { action: 'full_close'; reason: string };

export type ExitManageSettings = {
  partialTpEnabled: boolean;
  partialTpFraction: number;
  partialTpAtR: number;
  breakevenOnPartial: boolean;
  trailingEnabled: boolean;
  trailingStopPct: number;
  trailingActivateAtR: number;
  adverseREnabled: boolean;
  maxAdverseR: number;
  timeStopEnabled: boolean;
  maxHoldMs: number;
  minProgressR: number;
};

export const DEFAULT_EXIT_MANAGE_SETTINGS: ExitManageSettings = {
  partialTpEnabled: true,
  partialTpFraction: 0.33,
  partialTpAtR: 1.5,
  breakevenOnPartial: true,
  trailingEnabled: true,
  trailingStopPct: 1.5,
  trailingActivateAtR: 1.5,
  adverseREnabled: true,
  maxAdverseR: 0.75,
  timeStopEnabled: true,
  maxHoldMs: 6 * 60 * 60 * 1000,
  minProgressR: 0.3,
};

/** Pure decision for manage-then-exit (excludes applying trailing price updates). */
export function decideExitManagement(input: {
  side: Side;
  entry: number;
  price: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  trailingStopPrice?: number | null;
  trailingStopPct?: number | null;
  initialStopLoss?: number | null;
  partialTpDone?: boolean;
  openedAt?: Date | number | null;
  settings: ExitManageSettings;
}): ExitManageDecision {
  const {
    side,
    entry,
    price,
    stopLoss,
    takeProfit,
    trailingStopPrice,
    trailingStopPct,
    initialStopLoss,
    partialTpDone,
    openedAt,
    settings,
  } = input;

  // Full exits take priority when already past levels (e.g. gap through TP)
  if (side === Side.BUY) {
    if (stopLoss != null && price <= stopLoss) return { action: 'full_close', reason: 'Stop loss hit' };
    if (takeProfit != null && price >= takeProfit) return { action: 'full_close', reason: 'Take profit hit' };
    if (trailingStopPrice != null && price <= trailingStopPrice) {
      return { action: 'full_close', reason: 'Trailing stop hit' };
    }
  } else {
    if (stopLoss != null && price >= stopLoss) return { action: 'full_close', reason: 'Stop loss hit' };
    if (takeProfit != null && price <= takeProfit) return { action: 'full_close', reason: 'Take profit hit' };
    if (trailingStopPrice != null && price >= trailingStopPrice) {
      return { action: 'full_close', reason: 'Trailing stop hit' };
    }
  }

  const r = calcRMultiple({ side, entry, price, initialStopLoss, stopLoss });
  if (r == null) return { action: 'none' };

  if (settings.adverseREnabled && r <= -settings.maxAdverseR) {
    return { action: 'full_close', reason: 'Adverse R limit' };
  }

  if (settings.timeStopEnabled && openedAt != null) {
    const openedMs = openedAt instanceof Date ? openedAt.getTime() : Number(openedAt);
    if (
      Number.isFinite(openedMs) &&
      Date.now() - openedMs >= settings.maxHoldMs &&
      r < settings.minProgressR
    ) {
      return { action: 'full_close', reason: 'Time stop' };
    }
  }

  if (
    !partialTpDone &&
    settings.partialTpEnabled &&
    r >= settings.partialTpAtR
  ) {
    return {
      action: 'partial',
      fraction: settings.partialTpFraction,
      armTrailing: settings.trailingEnabled,
      trailingStopPct: settings.trailingStopPct,
      breakeven: settings.breakevenOnPartial,
    };
  }

  if (
    settings.trailingEnabled &&
    !(trailingStopPct != null && trailingStopPct > 0) &&
    r >= settings.trailingActivateAtR
  ) {
    return { action: 'arm_trailing', trailingStopPct: settings.trailingStopPct };
  }

  return { action: 'none' };
}

function tradingToExitSettings(trading: Record<string, unknown> | undefined): ExitManageSettings {
  const t = trading ?? {};
  return {
    partialTpEnabled: (t.partialTpEnabled as boolean | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.partialTpEnabled,
    partialTpFraction: (t.partialTpFraction as number | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.partialTpFraction,
    partialTpAtR: (t.partialTpAtR as number | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.partialTpAtR,
    breakevenOnPartial:
      (t.breakevenOnPartial as boolean | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.breakevenOnPartial,
    trailingEnabled: (t.trailingEnabled as boolean | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.trailingEnabled,
    trailingStopPct: (t.trailingStopPct as number | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.trailingStopPct,
    trailingActivateAtR:
      (t.trailingActivateAtR as number | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.trailingActivateAtR,
    adverseREnabled: (t.adverseREnabled as boolean | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.adverseREnabled,
    maxAdverseR: (t.maxAdverseR as number | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.maxAdverseR,
    timeStopEnabled: (t.timeStopEnabled as boolean | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.timeStopEnabled,
    maxHoldMs: (t.maxHoldMs as number | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.maxHoldMs,
    minProgressR: (t.minProgressR as number | undefined) ?? DEFAULT_EXIT_MANAGE_SETTINGS.minProgressR,
  };
}

export async function markPositions(userId?: string) {
  const q: Record<string, unknown> = { status: PositionStatus.OPEN };
  if (userId) q.userId = userId;
  const positions = await Position.find(q);
  const feeCache = new Map<string, number>();

  for (const p of positions) {
    // Cache-first mark (WS); avoid REST storms in the hot loop
    const price = getTickerPrice(p.symbol) ?? p.currentPrice;
    p.currentPrice = price;

    const uid = String(p.userId);
    let feeRate = feeCache.get(uid);
    if (feeRate == null) {
      try {
        const raw = await getRawSettings(uid);
        feeRate = raw.trading?.feeRate ?? config.feeRate;
      } catch {
        feeRate = config.feeRate;
      }
      feeCache.set(uid, feeRate);
    }

    // Net uPnL matches close PnL formula at this mark
    p.unrealizedPnl = calcNetPnl(p.side as Side, p.entryPrice, price, p.qty, feeRate);
    p.highestPrice = Math.max(p.highestPrice ?? price, price);
    p.lowestPrice = Math.min(p.lowestPrice ?? price, price);

    const upnl = p.unrealizedPnl ?? 0;
    const peak = p.peakUnrealizedPnl ?? 0;
    const trough = p.troughUnrealizedPnl ?? 0;
    const high = shouldNotifyProfitHigh(upnl, peak);
    if (high.notify) {
      p.peakUnrealizedPnl = high.newPeak;
      try {
        await notify(uid, NotificationType.PROFIT_HIGH, {
          title: `${p.symbol} new profit high`,
          body: `uPnL ${upnl.toFixed(2)} (was ${peak.toFixed(2)})`,
          payload: {
            positionId: String(p._id),
            tradeId: String(p.tradeId),
            upnl,
            peak,
          },
        });
      } catch {
        // don't block marking
      }
    }

    const low = shouldNotifyProfitLow(upnl, trough);
    if (low.notify) {
      p.troughUnrealizedPnl = low.newTrough;
      try {
        await notify(uid, NotificationType.PROFIT_LOW, {
          title: `${p.symbol} new uPnL low`,
          body: `uPnL ${upnl.toFixed(2)} (was ${trough.toFixed(2)})`,
          payload: {
            positionId: String(p._id),
            tradeId: String(p.tradeId),
            upnl,
            trough,
          },
        });
      } catch {
        // don't block marking
      }
    }

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
  const settingsCache = new Map<string, ExitManageSettings>();

  for (const p of positions) {
    const price = getTickerPrice(p.symbol) ?? p.currentPrice;
    const userId = String(p.userId);

    let settings = settingsCache.get(userId);
    if (!settings) {
      try {
        const raw = await getRawSettings(userId);
        settings = tradingToExitSettings(raw.trading as Record<string, unknown> | undefined);
      } catch {
        settings = DEFAULT_EXIT_MANAGE_SETTINGS;
      }
      settingsCache.set(userId, settings);
    }

    const decision = decideExitManagement({
      side: p.side as Side,
      entry: p.entryPrice,
      price,
      stopLoss: p.stopLoss,
      takeProfit: p.takeProfit,
      trailingStopPrice: p.trailingStopPrice,
      trailingStopPct: p.trailingStopPct,
      initialStopLoss: p.initialStopLoss,
      partialTpDone: p.partialTpDone ?? false,
      openedAt: p.openedAt,
      settings,
    });

    try {
      if (decision.action === 'full_close') {
        await closePosition(userId, String(p._id), decision.reason, price);
        continue;
      }

      if (decision.action === 'partial') {
        const closeQty = p.qty * decision.fraction;
        await partialClosePosition(userId, String(p._id), closeQty, 'Partial take profit', price);

        const fresh = await Position.findById(p._id);
        if (!fresh || fresh.status !== PositionStatus.OPEN) continue;

        fresh.partialTpDone = true;
        if (decision.breakeven) {
          fresh.stopLoss = fresh.entryPrice;
          await Trade.findByIdAndUpdate(fresh.tradeId, { stopLoss: fresh.entryPrice });
        }
        if (decision.armTrailing) {
          fresh.trailingStopPct = decision.trailingStopPct;
          if (fresh.side === Side.BUY) {
            fresh.trailingStopPrice =
              (fresh.highestPrice ?? price) * (1 - decision.trailingStopPct / 100);
          } else {
            fresh.trailingStopPrice =
              (fresh.lowestPrice ?? price) * (1 + decision.trailingStopPct / 100);
          }
        }
        await fresh.save();
        continue;
      }

      if (decision.action === 'arm_trailing') {
        p.trailingStopPct = decision.trailingStopPct;
        if (p.side === Side.BUY) {
          p.trailingStopPrice =
            (p.highestPrice ?? price) * (1 - decision.trailingStopPct / 100);
        } else {
          p.trailingStopPrice =
            (p.lowestPrice ?? price) * (1 + decision.trailingStopPct / 100);
        }
        await p.save();
      }
    } catch {
      // continue
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
  const set: Record<string, number> = {};
  if (patch.stopLoss != null) set.stopLoss = patch.stopLoss;
  if (patch.takeProfit != null) set.takeProfit = patch.takeProfit;
  if (patch.trailingStopPct != null) set.trailingStopPct = patch.trailingStopPct;
  if (Object.keys(set).length === 0) {
    throw new AppError('VALIDATION', 'No levels to update', 400);
  }

  const p = await Position.findOneAndUpdate(
    { _id: positionId, userId, status: PositionStatus.OPEN },
    { $set: set },
    { new: true },
  );
  if (!p) throw new AppError('NOT_FOUND', 'Position not found', 404);

  const tradeSet: Record<string, number> = {};
  if (set.stopLoss != null) tradeSet.stopLoss = set.stopLoss;
  if (set.takeProfit != null) tradeSet.takeProfit = set.takeProfit;
  if (set.trailingStopPct != null) tradeSet.trailingStopPct = set.trailingStopPct;
  await Trade.findByIdAndUpdate(p.tradeId, { $set: tradeSet });

  return p;
}
