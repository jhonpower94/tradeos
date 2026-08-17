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
  if (openCount >= risk.maxOpenPositions) {
    reasons.push(`Max open positions reached (${risk.maxOpenPositions})`);
  }
  if (hasOpenPositionOnSymbol(openPositions, o.symbol)) {
    reasons.push(alreadyOpenOnSymbolReason(o.symbol));
  }

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
  if (slDist <= 0) reasons.push('Invalid stop loss distance');

  if (o.riskReward < risk.minRiskReward) {
    reasons.push(`RR ${o.riskReward.toFixed(2)} < min ${risk.minRiskReward}`);
  }

  if (ctx.spreadBps != null && ctx.spreadBps > risk.maxSpreadBps) {
    reasons.push(`Spread ${ctx.spreadBps.toFixed(1)} bps exceeds max`);
  }

  if (ctx.volume24h != null && ctx.volume24h < risk.minLiquidityUsdt) {
    reasons.push('Insufficient liquidity');
  }

  if (ctx.atr && ctx.atr > 0) {
    const atrMult = slDist / ctx.atr;
    if (atrMult < risk.atrSlMultiplierMin) reasons.push('Stop loss too tight vs ATR');
    if (atrMult > risk.atrSlMultiplierMax) reasons.push('Stop loss too wide vs ATR');
  }

  const riskAmount = ctx.equity * risk.maxRiskPerTrade;
  let qty = slDist > 0 ? riskAmount / slDist : 0;
  qty = exchangeService.roundQty(o.symbol, qty);

  const { stepSize, minNotional } = exchangeService.getLotSize(o.symbol);
  const maxFreePct = risk.maxFreeNotionalPct ?? 0.25;
  const capNotional = Math.min(ctx.freeQuote, ctx.freeQuote * maxFreePct);
  if (o.entry > 0 && qty * o.entry > capNotional) {
    qty = exchangeService.roundQty(o.symbol, capNotional / o.entry);
    if (qty * o.entry > capNotional && stepSize > 0) {
      qty = exchangeService.roundQty(o.symbol, Math.max(0, qty - stepSize));
    }
  }

  const notional = qty * o.entry;
  if (qty <= 0) {
    reasons.push('Position size is zero');
  } else if (notional < minNotional) {
    if (ctx.freeQuote < minNotional || ctx.freeQuote < notional + stepSize * o.entry) {
      reasons.push(
        `Insufficient free balance (notional ${notional.toFixed(2)}, free ${ctx.freeQuote.toFixed(2)}, min ${minNotional})`,
      );
    } else {
      reasons.push(`Notional ${notional.toFixed(2)} below min`);
    }
  }

  return {
    ok: reasons.length === 0,
    qty: reasons.length === 0 ? qty : undefined,
    riskAmount,
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
  if (hasOpenPositionOnSymbol(openPositions, opportunity.symbol)) {
    return { ok: false, reason: alreadyOpenOnSymbolReason(opportunity.symbol) };
  }
  if (opportunity.riskReward < risk.minRiskReward) {
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
