import mongoose from 'mongoose';
import {
  PositionStatus,
  type Opportunity,
  type RiskSettings,
  type RiskValidationResult,
} from '@trading-os/shared';
import { Position } from '../../models/Position.js';
import { JournalEntry } from '../../models/JournalEntry.js';
import { exchangeService } from '../exchange/index.js';
import { getTickerPrice } from '../market-data/index.js';

export interface RiskContext {
  userId: string;
  equity: number;
  freeQuote: number;
  risk: RiskSettings;
  opportunity: Opportunity;
  atr?: number;
  spreadBps?: number;
  volume24h?: number;
}

/** Float tolerance so RR 1.999… with display 2.00 still meets min 2. */
const RR_EPS = 1e-9;

function dbReady() {
  return mongoose.connection.readyState === 1;
}

export function hasOpenPositionOnSymbol(
  openPositions: Array<{ symbol: string }>,
  symbol: string,
): boolean {
  return openPositions.some((p) => p.symbol === symbol);
}

export function alreadyOpenOnSymbolReason(symbol: string): string {
  return `Already have an open position in ${symbol}`;
}

/** Remaining slots for a new entry (0 when max open positions is already reached). */
export function remainingPositionSlots(maxOpenPositions: number, openCount: number): number {
  return Math.max(0, maxOpenPositions - openCount);
}

/**
 * Equal-split remaining free quote across remaining slots.
 * If minNotionalPerTrade > 0 and cash cannot fund every configured slot, drop
 * extra slots (e.g. 2100 free, min 1000, 3 slots → 2 × 1050).
 */
export function slotTargetNotional(
  freeQuote: number,
  remainingSlots: number,
  minNotionalPerTrade = 0,
): { targetNotional: number; slots: number } {
  if (!(freeQuote > 0) || remainingSlots <= 0) {
    return { targetNotional: 0, slots: 0 };
  }
  let slots = remainingSlots;
  if (minNotionalPerTrade > 0) {
    const affordable = Math.floor(freeQuote / minNotionalPerTrade + 1e-9);
    if (affordable < 1) {
      return { targetNotional: freeQuote, slots: 1 };
    }
    slots = Math.min(remainingSlots, affordable);
  }
  return { targetNotional: freeQuote / slots, slots };
}

export function meetsMinRiskReward(riskReward: number, minRiskReward: number): boolean {
  return riskReward + RR_EPS >= minRiskReward;
}

export interface PreviewRiskSizeInput {
  equity: number;
  freeQuote: number;
  risk: RiskSettings;
  opportunity: Pick<Opportunity, 'symbol' | 'entry' | 'stopLoss' | 'riskReward'>;
  openCount: number;
}

/**
 * Pure sizing + gate checks shared by list preview and validateRisk.
 * Skips daily loss, spread, liquidity, and ATR (those stay execute-only).
 */
export function previewRiskSize(input: PreviewRiskSizeInput): RiskValidationResult {
  const reasons: string[] = [];
  const { opportunity: o, risk, equity, freeQuote, openCount } = input;

  if (openCount >= risk.maxOpenPositions) {
    reasons.push(`Max open positions reached (${risk.maxOpenPositions})`);
  }

  const slDist = Math.abs(o.entry - o.stopLoss);
  if (slDist <= 0) reasons.push('Invalid stop loss distance');

  if (!meetsMinRiskReward(o.riskReward, risk.minRiskReward)) {
    reasons.push(`RR ${o.riskReward.toFixed(2)} < min ${risk.minRiskReward}`);
  }

  const remainingSlots = remainingPositionSlots(risk.maxOpenPositions, openCount);
  const minNotionalPerTrade = risk.minNotionalPerTrade ?? 1000;
  const { targetNotional } = slotTargetNotional(
    freeQuote,
    remainingSlots,
    minNotionalPerTrade,
  );

  const riskAmount = equity * risk.maxRiskPerTrade;
  let qty = slDist > 0 ? riskAmount / slDist : 0;
  qty = exchangeService.roundQty(o.symbol, qty);

  const { stepSize, minNotional } = exchangeService.getLotSize(o.symbol);
  const capNotional = remainingSlots > 0 ? Math.min(freeQuote, targetNotional) : 0;
  if (remainingSlots > 0 && o.entry > 0 && qty * o.entry > capNotional) {
    qty = exchangeService.roundQty(o.symbol, capNotional / o.entry);
    if (qty * o.entry > capNotional && stepSize > 0) {
      qty = exchangeService.roundQty(o.symbol, Math.max(0, qty - stepSize));
    }
  }

  const notional = qty * o.entry;
  if (remainingSlots > 0) {
    if (qty <= 0) {
      reasons.push('Position size is zero');
    } else if (notional < minNotional) {
      if (freeQuote < minNotional || freeQuote < notional + stepSize * o.entry) {
        reasons.push(
          `Insufficient free balance (notional ${notional.toFixed(2)}, free ${freeQuote.toFixed(2)}, min ${minNotional})`,
        );
      } else {
        reasons.push(`Notional ${notional.toFixed(2)} below min`);
      }
    } else if (minNotionalPerTrade > 0 && notional + 1e-9 < minNotionalPerTrade) {
      reasons.push(
        `Notional ${notional.toFixed(2)} below min per trade (${minNotionalPerTrade})`,
      );
    }
  }

  return {
    ok: reasons.length === 0,
    qty: reasons.length === 0 ? qty : undefined,
    notional,
    riskAmount,
    reasons,
  };
}

/** Attach live sizePreview to list rows (not persisted). */
export function withSizePreview<
  T extends { symbol: string; entry?: number; stopLoss?: number; riskReward?: number },
>(
  items: T[],
  ctx: { equity: number; freeQuote: number; risk: RiskSettings; openCount: number },
): Array<T & { sizePreview: RiskValidationResult }> {
  return items.map((item) => ({
    ...item,
    sizePreview: previewRiskSize({
      equity: ctx.equity,
      freeQuote: ctx.freeQuote,
      risk: ctx.risk,
      opportunity: {
        symbol: String(item.symbol),
        entry: Number(item.entry),
        stopLoss: Number(item.stopLoss),
        riskReward: Number(item.riskReward),
      },
      openCount: ctx.openCount,
    }),
  }));
}

export async function countOpenPositions(userId: string): Promise<number> {
  if (!dbReady()) return 0;
  try {
    return await Position.countDocuments({ userId, status: PositionStatus.OPEN });
  } catch {
    return 0;
  }
}

export async function validateRisk(ctx: RiskContext): Promise<RiskValidationResult> {
  const reasons: string[] = [];
  const { opportunity: o, risk } = ctx;

  let openPositions: Array<{ symbol: string; unrealizedPnl?: number }> = [];
  if (dbReady()) {
    try {
      const rows = await Position.find({
        userId: ctx.userId,
        status: PositionStatus.OPEN,
      }).lean();
      openPositions = rows.map((p) => ({
        symbol: p.symbol,
        unrealizedPnl: p.unrealizedPnl ?? 0,
      }));
    } catch {
      openPositions = [];
    }
  }
  const openCount = openPositions.length;
  const unrealizedPnl = openPositions.reduce((a, p) => a + (p.unrealizedPnl ?? 0), 0);

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  let closedDailyPnl = 0;
  if (dbReady()) {
    try {
      const todays = await JournalEntry.find({
        userId: ctx.userId,
        createdAt: { $gte: startOfDay },
      }).lean();
      closedDailyPnl = todays.reduce((a, j) => a + (j.pnl ?? 0), 0);
    } catch {
      closedDailyPnl = 0;
    }
  }
  const dailyPnl = closedDailyPnl + unrealizedPnl;
  if (dailyPnl < 0 && Math.abs(dailyPnl) >= ctx.equity * risk.maxDailyLoss) {
    reasons.push('Max daily loss reached');
  }

  const slDist = Math.abs(o.entry - o.stopLoss);

  if (ctx.spreadBps != null && ctx.spreadBps > risk.maxSpreadBps) {
    reasons.push(`Spread ${ctx.spreadBps.toFixed(1)} bps exceeds max`);
  }

  if (ctx.volume24h != null && ctx.volume24h < risk.minLiquidityUsdt) {
    reasons.push('Insufficient liquidity');
  }

  if (ctx.atr && ctx.atr > 0 && slDist > 0) {
    const atrMult = slDist / ctx.atr;
    if (atrMult < risk.atrSlMultiplierMin) reasons.push('Stop loss too tight vs ATR');
    if (atrMult > risk.atrSlMultiplierMax) reasons.push('Stop loss too wide vs ATR');
  }

  const sized = previewRiskSize({
    equity: ctx.equity,
    freeQuote: ctx.freeQuote,
    risk,
    opportunity: o,
    openCount,
  });
  reasons.push(...sized.reasons);

  return {
    ok: reasons.length === 0,
    qty: reasons.length === 0 ? sized.qty : undefined,
    notional: sized.notional,
    riskAmount: sized.riskAmount,
    reasons,
  };
}

export async function softPrecheck(
  userId: string,
  opportunity: Opportunity,
  risk: RiskSettings,
  equity: number,
): Promise<{ ok: boolean; reason?: string }> {
  let openPositions: Array<{ symbol: string }> = [];
  if (dbReady()) {
    try {
      const rows = await Position.find({ userId, status: PositionStatus.OPEN })
        .select('symbol')
        .lean();
      openPositions = rows.map((p) => ({ symbol: p.symbol }));
    } catch {
      openPositions = [];
    }
  }
  if (openPositions.length >= risk.maxOpenPositions) {
    return { ok: false, reason: `Max open positions reached (${risk.maxOpenPositions})` };
  }
  if (!meetsMinRiskReward(opportunity.riskReward, risk.minRiskReward)) {
    return {
      ok: false,
      reason: `RR ${opportunity.riskReward.toFixed(2)} < min ${risk.minRiskReward}`,
    };
  }
  const price = getTickerPrice(opportunity.symbol);
  if (price && Math.abs(price - opportunity.entry) / opportunity.entry > 0.02) {
    return { ok: false, reason: 'Entry drifted more than 2% from signal price' };
  }
  void equity;
  return { ok: true };
}
