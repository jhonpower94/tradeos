import { Side } from '@trading-os/shared';
import { exchangeService, type OrderResult } from '../exchange/index.js';
import { getTickerPrice, setTickerPrice } from '../market-data/index.js';

export function estimateExitFee(price: number, qty: number, feeRate: number): number {
  return price * qty * feeRate;
}

export function calcGrossPnl(side: Side, entry: number, exit: number, qty: number): number {
  const dir = side === Side.BUY ? 1 : -1;
  return (exit - entry) * qty * dir;
}

/** Realized-style PnL: gross mark-to-market minus estimated exit fee. */
export function calcNetPnl(
  side: Side,
  entry: number,
  exit: number,
  qty: number,
  feeRate: number,
): number {
  return calcGrossPnl(side, entry, exit, qty) - estimateExitFee(exit, qty, feeRate);
}

export function fillPriceFromOrder(order: Pick<OrderResult, 'executedQty' | 'cummulativeQuoteQty'>): number | null {
  if (!(order.executedQty > 0)) return null;
  const avg = order.cummulativeQuoteQty / order.executedQty;
  return Number.isFinite(avg) && avg > 0 ? avg : null;
}

/**
 * Best available mark: in-memory ticker cache, else REST ticker (and cache it), else fallback.
 * Prefer cache in hot loops (markPositions) by passing `allowRest: false`.
 */
export async function resolveMarkPrice(
  symbol: string,
  fallback?: number,
  opts?: { allowRest?: boolean },
): Promise<number | undefined> {
  const cached = getTickerPrice(symbol);
  if (cached != null && cached > 0) return cached;

  if (opts?.allowRest !== false) {
    try {
      const ticker = await exchangeService.getTicker(symbol);
      if (ticker.price > 0) {
        setTickerPrice(symbol, ticker.price);
        return ticker.price;
      }
    } catch {
      // fall through
    }
  }

  if (fallback != null && fallback > 0) return fallback;
  return undefined;
}
