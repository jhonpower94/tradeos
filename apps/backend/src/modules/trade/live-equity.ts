import { ExecutionVenue, PositionStatus } from '@trading-os/shared';
import { Position } from '../../models/Position.js';
import { exchangeService } from '../exchange/index.js';

/**
 * USDT stack in Spot (free + locked) for sizing equity and risk budget.
 */
function spotUsdtStack(
  balances: Awaited<ReturnType<typeof exchangeService.getBalances>>,
): number {
  const usdt = balances.find((b) => b.asset === 'USDT');
  return (usdt?.free ?? 0) + (usdt?.locked ?? 0);
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

/**
 * Live trading equity and paper-style risk budget for slot-based sizing.
 *
 * - **equity**: spot USDT (free+locked) + isolated quote net (USDT) + open uPnL (margin),
 *   or spot + uPnL (spot-only).
 * - **riskFreeQuote**: same stack minus deployed notional (Σ qty×entry on open positions),
 *   so remaining slots split the spendable stack like paper mode.
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

  if (executionVenue === ExecutionVenue.SPOT) {
    const equity = spotUsdt + unrealized;
    const riskFreeQuote = Math.max(0, spotUsdt - deployed);
    return { equity, riskFreeQuote };
  }

  try {
    const pairs = await exchangeService.getIsolatedMarginAccount();
    const isolatedNet = sumIsolatedQuoteNetUsdt(pairs);
    const stack = spotUsdt + isolatedNet;
    const equity = stack + unrealized;
    const riskFreeQuote = Math.max(0, stack - deployed);
    return { equity, riskFreeQuote };
  } catch {
    const equity = spotUsdt + unrealized;
    const riskFreeQuote = Math.max(0, spotUsdt - deployed);
    return { equity, riskFreeQuote };
  }
}
