import { Side, SignalStatus, type Opportunity } from '@trading-os/shared';
import { SymbolSuppression } from '../../models/SymbolSuppression.js';
import { Signal } from '../../models/Signal.js';
import { isWatching } from '../ranking/index.js';

export function oppositeSide(side: Side): Side {
  return side === Side.BUY ? Side.SELL : Side.BUY;
}

export function hasOppositeTriggeredRelease(opps: Opportunity[], losingSide: Side): boolean {
  const want = oppositeSide(losingSide);
  return opps.some((o) => o.side === want && !isWatching(o));
}

export function shouldSuppressManualLoss(
  reason: string,
  pnl: number,
  hideAfterManualLoss: boolean | undefined,
): boolean {
  return reason === 'Manual close' && pnl < 0 && hideAfterManualLoss !== false;
}

export async function getActiveSuppression(userId: string, symbol: string) {
  return SymbolSuppression.findOne({ userId, symbol: symbol.toUpperCase() }).lean();
}

export async function createSuppression(userId: string, symbol: string, losingSide: Side) {
  const sym = symbol.toUpperCase();
  return SymbolSuppression.findOneAndUpdate(
    { userId, symbol: sym },
    { $set: { losingSide, createdAt: new Date() } },
    { upsert: true, new: true },
  ).lean();
}

export async function clearSuppression(userId: string, symbol: string) {
  await SymbolSuppression.deleteOne({ userId, symbol: symbol.toUpperCase() });
}

export async function expireSymbolSignals(userId: string, symbol: string) {
  await Signal.updateMany(
    {
      userId,
      symbol: symbol.toUpperCase(),
      status: { $in: [SignalStatus.RANKED, SignalStatus.WATCHING] },
    },
    { $set: { status: SignalStatus.EXPIRED } },
  );
}
