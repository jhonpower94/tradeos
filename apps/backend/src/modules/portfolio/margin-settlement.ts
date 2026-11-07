import { ExecutionVenue, TradeStatus, TradingMode, TradeVenue, Side, OrderType } from '@trading-os/shared';
import { Trade } from '../../models/Trade.js';
import { AppError } from '../../utils/errors.js';
import { exchangeService, type IsolatedMarginPairAccount } from '../exchange/index.js';
import { getBinanceCredentials, getRawSettings } from '../settings/index.js';

const USDT_DUST = 0.01;
const QTY_DUST = 1e-8;

export type MarginSettlementStatus =
  | 'settled'
  | 'debt_remaining'
  | 'sweepable'
  | 'failed';

export interface MarginWalletView {
  symbol: string;
  marginLevel: number;
  enabled: boolean;
  base: IsolatedMarginPairAccount['base'];
  quote: IsolatedMarginPairAccount['quote'];
  hasDebt: boolean;
  maxTransferableUsdt: number;
  sweepableUsdt: number;
  status: 'clear' | 'debt' | 'ready_to_sweep';
  linkedTradeId?: string;
}

function borrowTotal(asset: { borrowed: number; interest: number }): number {
  return Math.max(0, asset.borrowed + asset.interest);
}

function pairHasDebt(pair: IsolatedMarginPairAccount): boolean {
  return borrowTotal(pair.base) > QTY_DUST || borrowTotal(pair.quote) > USDT_DUST;
}

function walletStatus(pair: IsolatedMarginPairAccount, maxTransferableUsdt: number): MarginWalletView['status'] {
  if (pairHasDebt(pair)) return 'debt';
  if (maxTransferableUsdt > USDT_DUST) return 'ready_to_sweep';
  return 'clear';
}

async function withLiveMarginExchange(userId: string): Promise<void> {
  const settings = await getRawSettings(userId);
  const mode = settings.trading?.mode === TradingMode.LIVE ? TradingMode.LIVE : TradingMode.PAPER;
  const venue = settings.trading?.executionVenue ?? ExecutionVenue.MARGIN;
  if (mode !== TradingMode.LIVE || venue === ExecutionVenue.SPOT) {
    throw new AppError('PAPER_ONLY', 'Isolated margin wallet actions require live margin mode', 400);
  }
  const creds = await getBinanceCredentials(userId);
  if (!creds) {
    throw new AppError('NO_KEYS', 'Binance API keys required', 400);
  }
  exchangeService.setCredentials(creds);
}

async function getPairOrThrow(symbol: string): Promise<IsolatedMarginPairAccount> {
  const sym = symbol.toUpperCase();
  const pairs = await exchangeService.getIsolatedMarginAccount(sym);
  const pair = pairs.find((p) => p.symbol === sym);
  if (!pair) {
    throw new AppError('NOT_FOUND', `Isolated margin account for ${sym} not found`, 404);
  }
  return pair;
}

async function ensureQuoteForRepay(
  symbol: string,
  pair: IsolatedMarginPairAccount,
  needUsdt: number,
  actions: string[],
): Promise<void> {
  if (needUsdt <= USDT_DUST) return;
  const free = pair.quote.free;
  if (free + USDT_DUST >= needUsdt) return;
  const gap = needUsdt - free;
  const spot = await exchangeService.getBalances();
  const spotFree = spot.find((b) => b.asset === 'USDT')?.free ?? 0;
  if (spotFree + USDT_DUST < gap) {
    throw new AppError(
      'INSUFFICIENT_MARGIN',
      `Need ~${needUsdt.toFixed(2)} USDT in isolated ${symbol} to repay; have ${free.toFixed(2)} isolated and ${spotFree.toFixed(2)} spot free`,
      400,
    );
  }
  const transferAmt = Number(Math.min(gap * 1.02, spotFree).toFixed(8));
  await exchangeService.transferIsolatedMargin({
    asset: 'USDT',
    symbol,
    amount: transferAmt,
    direction: 'to_isolated',
  });
  actions.push('spot_to_isolated');
}

export async function listMarginWallets(userId: string): Promise<{ items: MarginWalletView[] }> {
  await withLiveMarginExchange(userId);
  const pairs = await exchangeService.getIsolatedMarginAccount();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentClosed = await Trade.find({
    userId,
    status: TradeStatus.CLOSED,
    venue: TradeVenue.MARGIN,
    closedAt: { $gte: since },
  })
    .sort({ closedAt: -1 })
    .lean();
  const tradeBySymbol = new Map<string, string>();
  for (const t of recentClosed) {
    const s = String(t.symbol).toUpperCase();
    if (!tradeBySymbol.has(s)) tradeBySymbol.set(s, String(t._id));
  }

  const items: MarginWalletView[] = [];
  for (const pair of pairs) {
    if (!pair.enabled && !pairHasDebt(pair) && pair.quote.netAsset < USDT_DUST && pair.base.netAsset < QTY_DUST) {
      continue;
    }
    let maxTransferableUsdt = 0;
    try {
      if (pair.quote.asset === 'USDT') {
        maxTransferableUsdt = await exchangeService.getMaxTransferable('USDT', pair.symbol);
      }
    } catch {
      maxTransferableUsdt = 0;
    }
    const hasDebt = pairHasDebt(pair);
    const sweepableUsdt = hasDebt
      ? 0
      : Math.min(Math.max(0, pair.quote.free), Math.max(0, maxTransferableUsdt));
    items.push({
      symbol: pair.symbol,
      marginLevel: pair.marginLevel,
      enabled: pair.enabled,
      base: pair.base,
      quote: pair.quote,
      hasDebt,
      maxTransferableUsdt,
      sweepableUsdt,
      status: walletStatus(pair, maxTransferableUsdt),
      linkedTradeId: tradeBySymbol.get(pair.symbol),
    });
  }
  items.sort((a, b) => {
    if (a.hasDebt !== b.hasDebt) return a.hasDebt ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });
  return { items };
}

export async function repayMarginWallet(
  userId: string,
  symbol: string,
  opts?: { asset?: string; amount?: number },
): Promise<{ actions: string[]; pair: IsolatedMarginPairAccount }> {
  await withLiveMarginExchange(userId);
  const actions: string[] = [];
  let pair = await getPairOrThrow(symbol);
  if (!pairHasDebt(pair) && opts?.amount == null) {
    return { actions, pair };
  }

  const repayQuoteDebt = async () => {
    const owed = borrowTotal(pair.quote);
    if (owed <= USDT_DUST) return;
    const amt = Math.min(opts?.amount ?? owed, pair.quote.free, owed);
    if (amt <= USDT_DUST) {
      throw new AppError(
        'INSUFFICIENT_MARGIN',
        `Need USDT in isolated ${symbol} to repay quote debt ${owed.toFixed(4)}`,
        400,
      );
    }
    await exchangeService.repayIsolatedMargin({ symbol, asset: pair.quote.asset, amount: Number(amt.toFixed(8)) });
    actions.push('repay_quote');
  };

  const repayBaseDebt = async () => {
    const owed = borrowTotal(pair.base);
    if (owed <= QTY_DUST) return;

    // Prefer explicit repay when free base is already sitting in the isolated wallet.
    const freeBase = Math.max(0, pair.base.free);
    if (freeBase > QTY_DUST) {
      const repayAmt = Number(Math.min(freeBase, opts?.amount ?? owed).toFixed(8));
      if (repayAmt > QTY_DUST) {
        await exchangeService.repayIsolatedMargin({
          symbol,
          asset: pair.base.asset,
          amount: repayAmt,
        });
        actions.push('repay_base');
        pair = await getPairOrThrow(symbol);
        if (borrowTotal(pair.base) <= QTY_DUST) return;
      }
    }

    if (opts?.asset && opts.asset.toUpperCase() === pair.base.asset.toUpperCase() && opts.amount != null) {
      await exchangeService.repayIsolatedMargin({
        symbol,
        asset: pair.base.asset,
        amount: opts.amount,
      });
      actions.push('repay_base');
      return;
    }

    await exchangeService.getExchangeInfo();
    let price = 0;
    try {
      const t = await exchangeService.getTicker(symbol);
      price = t.price;
    } catch {
      /* */
    }
    const stillOwed = borrowTotal(pair.base);
    // Bump to MIN_NOTIONAL when residual dust would fail Filter failure: NOTIONAL.
    const qty =
      price > 0
        ? exchangeService.qtyToCoverBorrow(symbol, stillOwed, price)
        : exchangeService.roundQty(symbol, stillOwed) || stillOwed;
    if (!(qty > 0)) {
      throw new AppError(
        'REPAY_FAILED',
        `Cannot size repay order for ${stillOwed} ${pair.base.asset} on ${symbol}`,
        400,
      );
    }
    const estQuote = price > 0 ? qty * price * 1.05 : 0;
    if (estQuote > USDT_DUST) {
      await ensureQuoteForRepay(symbol, pair, estQuote, actions);
      pair = await getPairOrThrow(symbol);
    }
    await exchangeService.placeMarginOrder({
      symbol,
      side: Side.BUY,
      type: OrderType.MARKET,
      quantity: qty,
      sideEffectType: 'AUTO_REPAY',
    });
    actions.push('buy_auto_repay');

    // Over-buy for min notional can leave free base; repay any remaining borrow from it.
    pair = await getPairOrThrow(symbol);
    const leftoverOwed = borrowTotal(pair.base);
    const leftoverFree = Math.max(0, pair.base.free);
    if (leftoverOwed > QTY_DUST && leftoverFree > QTY_DUST) {
      const repayAmt = Number(Math.min(leftoverFree, leftoverOwed).toFixed(8));
      await exchangeService.repayIsolatedMargin({
        symbol,
        asset: pair.base.asset,
        amount: repayAmt,
      });
      actions.push('repay_base');
    }
  };

  if (opts?.asset) {
    const asset = opts.asset.toUpperCase();
    if (asset === pair.quote.asset.toUpperCase()) {
      const owed = borrowTotal(pair.quote);
      const amt = opts.amount ?? Math.min(owed, pair.quote.free);
      if (amt <= USDT_DUST) {
        throw new AppError('MARGIN_DEBT', 'No quote debt to repay', 400);
      }
      await exchangeService.repayIsolatedMargin({ symbol, asset: pair.quote.asset, amount: Number(amt.toFixed(8)) });
      actions.push('repay_quote');
    } else if (asset === pair.base.asset.toUpperCase()) {
      await repayBaseDebt();
    } else {
      throw new AppError('INVALID_ASSET', `Asset ${asset} not in pair ${symbol}`, 400);
    }
  } else {
    await repayBaseDebt();
    pair = await getPairOrThrow(symbol);
    await repayQuoteDebt();
  }

  pair = await getPairOrThrow(symbol);
  if (pairHasDebt(pair)) {
    throw new AppError(
      'MARGIN_DEBT',
      `Borrow still open on ${symbol}: ${pair.base.asset} ${borrowTotal(pair.base).toPrecision(6)}, ${pair.quote.asset} ${borrowTotal(pair.quote).toFixed(4)}`,
      409,
    );
  }
  return { actions, pair };
}

export async function transferMarginToSpot(
  userId: string,
  symbol: string,
  opts?: { amount?: number },
): Promise<{ actions: string[]; amount: number }> {
  await withLiveMarginExchange(userId);
  const pair = await getPairOrThrow(symbol);
  if (pairHasDebt(pair)) {
    throw new AppError(
      'MARGIN_DEBT',
      'Repay borrowed assets before transferring out of isolated margin',
      400,
    );
  }
  if (pair.quote.asset !== 'USDT') {
    throw new AppError('UNSUPPORTED', 'v1 transfers USDT quote only', 400);
  }
  const max = await exchangeService.getMaxTransferable('USDT', symbol);
  if (max <= USDT_DUST) {
    throw new AppError(
      'TRANSFER_BLOCKED',
      `Binance max transferable USDT is ${max.toFixed(4)} for ${symbol} (margin level may be too low)`,
      400,
    );
  }
  const amount = Number(
    (opts?.amount != null ? Math.min(opts.amount, max) : max).toFixed(8),
  );
  if (amount <= USDT_DUST) {
    throw new AppError('TRANSFER_BLOCKED', 'Nothing to transfer', 400);
  }
  await exchangeService.transferIsolatedMargin({
    asset: 'USDT',
    symbol,
    amount,
    direction: 'to_spot',
  });
  return { actions: ['transfer'], amount };
}

export async function settleMarginWallet(
  userId: string,
  symbol: string,
): Promise<{ actions: string[]; transferAmount: number }> {
  const repay = await repayMarginWallet(userId, symbol);
  const xfer = await transferMarginToSpot(userId, symbol);
  return { actions: [...repay.actions, ...xfer.actions], transferAmount: xfer.amount };
}

export async function reconcileIsolatedSymbol(
  userId: string,
  symbol: string,
): Promise<{ status: MarginSettlementStatus; message: string; actions: string[] }> {
  const actions: string[] = [];
  try {
    await withLiveMarginExchange(userId);
    let pair = await getPairOrThrow(symbol);
    if (!pairHasDebt(pair)) {
      let max = 0;
      try {
        max = await exchangeService.getMaxTransferable('USDT', symbol);
      } catch {
        /* */
      }
      const status: MarginSettlementStatus = max > USDT_DUST ? 'sweepable' : 'settled';
      return {
        status,
        message:
          status === 'sweepable'
            ? 'No debt; USDT can be swept to Spot'
            : 'Isolated wallet clear',
        actions,
      };
    }
    try {
      const rep = await repayMarginWallet(userId, symbol);
      actions.push(...rep.actions);
    } catch (e) {
      if (e instanceof AppError) {
        return { status: 'debt_remaining', message: e.message, actions };
      }
      throw e;
    }
    pair = await getPairOrThrow(symbol);
    if (pairHasDebt(pair)) {
      return {
        status: 'debt_remaining',
        message: `Borrow remains on ${symbol}`,
        actions,
      };
    }
    let max = 0;
    try {
      max = await exchangeService.getMaxTransferable('USDT', symbol);
    } catch {
      /* */
    }
    return {
      status: max > USDT_DUST ? 'sweepable' : 'settled',
      message: max > USDT_DUST ? 'Debt cleared; sweep USDT to Spot when ready' : 'Debt cleared',
      actions,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Reconcile failed';
    return { status: 'failed', message, actions };
  }
}

export async function persistTradeMarginSettlement(
  tradeId: string,
  result: { status: MarginSettlementStatus; message: string },
): Promise<void> {
  await Trade.findByIdAndUpdate(tradeId, {
    marginSettlement: {
      status: result.status,
      message: result.message,
      at: new Date(),
    },
  });
}
