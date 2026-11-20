import { ExecutionVenue, PositionStatus } from '@trading-os/shared';
import { Position } from '../../models/Position.js';
import { exchangeService } from '../exchange/index.js';

/**
 * Leave headroom so market buys/fees don't hit Binance -2010 at 100% of wallet.
 * Applied only to riskFreeQuote (sizing), not equity display.
 */
export const LIVE_RISK_QUOTE_HAIRCUT = 0.95;

/**
 * USDT stack in Spot (free + locked) for sizing equity and risk budget.
 */
function spotUsdtStack(
  balances: Awaited<ReturnType<typeof exchangeService.getBalances>>,
): number {
  const usdt = balances.find((b) => b.asset === 'USDT');
  return (usdt?.free ?? 0) + (usdt?.locked ?? 0);
}

function spotUsdtFree(
  balances: Awaited<ReturnType<typeof exchangeService.getBalances>>,
): number {
  return balances.find((b) => b.asset === 'USDT')?.free ?? 0;
}

function sumIsolatedQuoteNetUsdt(
  pairs: Awaited<ReturnType<typeof exchangeService.getIsolatedMarginAccount>>,
): number {
  let n = 0;
  for (const pair of pairs) {
    if (pair.quote.asset === 'USDT') n += pair.quote.netAsset;
  }
  return n;
}

function sumIsolatedQuoteFreeUsdt(
  pairs: Awaited<ReturnType<typeof exchangeService.getIsolatedMarginAccount>>,
): number {
  let n = 0;
  for (const pair of pairs) {
    if (pair.quote.asset === 'USDT') n += pair.quote.free;
  }
  return n;
}

/**
 * Live trading equity and paper-style risk budget for slot-based sizing.
 *
 * - **equity**: spot USDT (free+locked) + isolated quote net (USDT) + open uPnL (margin),
 *   or spot + uPnL (spot-only).
 * - **riskFreeQuote**: spendable free USDT (spot free + isolated free) minus deployed,
 *   then haircut for fees/slippage so orders don't size to 100% of the wallet.
 *
 * Caller must set Binance credentials on `exchangeService` before calling.
 */
export async function computeLiveEquityAndRiskBudget(
  userId: string,
  executionVenue: ExecutionVenue,
): Promise<{ equity: number; riskFreeQuote: number }> {
  const open = await Position.find({ userId, status: PositionStatus.OPEN })
    .select('qty entryPrice unrealizedPnl')
    .lean();
  const deployed = open.reduce((a, p) => a + Number(p.qty) * Number(p.entryPrice), 0);
  const unrealized = open.reduce((a, p) => a + (p.unrealizedPnl ?? 0), 0);

  const balances = await exchangeService.getBalances();
  const spotUsdt = spotUsdtStack(balances);
  const spotFree = spotUsdtFree(balances);

  if (executionVenue === ExecutionVenue.SPOT) {
    const equity = spotUsdt + unrealized;
    const riskFreeQuote =
      Math.max(0, spotFree - deployed) * LIVE_RISK_QUOTE_HAIRCUT;
    return { equity, riskFreeQuote };
  }

  try {
    const pairs = await exchangeService.getIsolatedMarginAccount();
    const isolatedNet = sumIsolatedQuoteNetUsdt(pairs);
    const isolatedFree = sumIsolatedQuoteFreeUsdt(pairs);
    const stack = spotUsdt + isolatedNet;
    const equity = stack + unrealized;
    const spendable = Math.max(0, spotFree + isolatedFree - deployed);
    const riskFreeQuote = spendable * LIVE_RISK_QUOTE_HAIRCUT;
    return { equity, riskFreeQuote };
  } catch {
    const equity = spotUsdt + unrealized;
    const riskFreeQuote =
      Math.max(0, spotFree - deployed) * LIVE_RISK_QUOTE_HAIRCUT;
    return { equity, riskFreeQuote };
  }
}
