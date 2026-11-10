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
  maxTransferableBase: number;
  sweepableUsdt: number;
  sweepableBase: number;
  status: 'clear' | 'debt' | 'ready_to_sweep';
  linkedTradeId?: string;
}

function borrowTotal(asset: { borrowed: number; interest: number }): number {
  return Math.max(0, asset.borrowed + asset.interest);
}

function pairHasDebt(pair: IsolatedMarginPairAccount): boolean {
  return borrowTotal(pair.base) > QTY_DUST || borrowTotal(pair.quote) > USDT_DUST;
}

function transferDust(asset: string): number {
  return asset.toUpperCase() === 'USDT' ? USDT_DUST : QTY_DUST;
}

function walletStatus(
  pair: IsolatedMarginPairAccount,
  maxTransferableUsdt: number,
  maxTransferableBase: number,
): MarginWalletView['status'] {
  if (pairHasDebt(pair)) return 'debt';
  if (maxTransferableUsdt > USDT_DUST || maxTransferableBase > QTY_DUST) return 'ready_to_sweep';
  return 'clear';
}

async function readMaxTransferable(asset: string, symbol: string): Promise<number> {
  try {
    return await exchangeService.getMaxTransferable(asset, symbol);
  } catch {
    return 0;
  }
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
    const maxTransferableUsdt =
      pair.quote.asset.toUpperCase() === 'USDT'
        ? await readMaxTransferable('USDT', pair.symbol)
        : await readMaxTransferable(pair.quote.asset, pair.symbol);
    const maxTransferableBase =
      pair.base.free > QTY_DUST || pair.base.netAsset > QTY_DUST
        ? await readMaxTransferable(pair.base.asset, pair.symbol)
        : 0;
    const hasDebt = pairHasDebt(pair);
    const sweepableUsdt = hasDebt
      ? 0
      : Math.min(Math.max(0, pair.quote.free), Math.max(0, maxTransferableUsdt));
    const sweepableBase = hasDebt
      ? 0
      : Math.min(Math.max(0, pair.base.free), Math.max(0, maxTransferableBase));
    items.push({
      symbol: pair.symbol,
      marginLevel: pair.marginLevel,
      enabled: pair.enabled,
      base: pair.base,
      quote: pair.quote,
      hasDebt,
      maxTransferableUsdt,
      maxTransferableBase,
      sweepableUsdt,
      sweepableBase,
      status: walletStatus(pair, maxTransferableUsdt, maxTransferableBase),
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

async function transferAssetToSpot(
  symbol: string,
  asset: string,
  actions: string[],
  amounts: Record<string, number>,
  opts?: { amount?: number },
): Promise<number> {
  const dust = transferDust(asset);
  const max = await readMaxTransferable(asset, symbol);
  const capped =
    opts?.amount != null ? Math.min(opts.amount, Math.max(0, max)) : Math.max(0, max);
  const amount = Number(capped.toFixed(8));
  if (amount <= dust) return 0;
  await exchangeService.transferIsolatedMargin({
    asset,
    symbol,
    amount,
    direction: 'to_spot',
  });
  const key = asset.toUpperCase();
  amounts[key] = (amounts[key] ?? 0) + amount;
  actions.push(asset.toUpperCase() === 'USDT' ? 'transfer_usdt' : 'transfer_base');
  return amount;
}

export async function transferMarginToSpot(
  userId: string,
  symbol: string,
  opts?: { amount?: number },
): Promise<{
  actions: string[];
  amount: number;
  amounts: Record<string, number>;
  baseTransferAmount: number;
}> {
  await withLiveMarginExchange(userId);
  const pair = await getPairOrThrow(symbol);
  if (pairHasDebt(pair)) {
    throw new AppError(
      'MARGIN_DEBT',
      'Repay borrowed assets before transferring out of isolated margin',
      400,
    );
  }

  const actions: string[] = [];
  const amounts: Record<string, number> = {};

  // Quote first (optional amount caps quote only), then base, then quote retry when
  // doing a full sweep so residual free after base leaves can still move out.
  await transferAssetToSpot(symbol, pair.quote.asset, actions, amounts, {
    amount: opts?.amount,
  });
  await transferAssetToSpot(symbol, pair.base.asset, actions, amounts);
  if (opts?.amount == null) {
    await transferAssetToSpot(symbol, pair.quote.asset, actions, amounts);
  }

  const amount = amounts[pair.quote.asset.toUpperCase()] ?? 0;
  const baseTransferAmount = amounts[pair.base.asset.toUpperCase()] ?? 0;
  if (amount <= transferDust(pair.quote.asset) && baseTransferAmount <= transferDust(pair.base.asset)) {
    throw new AppError(
      'TRANSFER_BLOCKED',
      `Nothing transferable out of isolated ${symbol}`,
      400,
    );
  }
  // Keep legacy `transfer` alias when only a single USDT move happened for older clients/tests.
  if (actions.length === 1 && actions[0] === 'transfer_usdt') {
    actions[0] = 'transfer';
  }
  return { actions, amount, amounts, baseTransferAmount };
}

function isUnsellableFilterError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /NOTIONAL|MIN_NOTIONAL|LOT_SIZE|MIN_QTY|insufficient balance|Insufficient/i.test(msg);
}

async function sizeSellableBaseQty(
  symbol: string,
  freeBase: number,
): Promise<{ qty: number; price: number; minNotional: number; estimated: number }> {
  const sym = symbol.toUpperCase();
  await exchangeService.getExchangeInfo();
  let price = 0;
  try {
    price = (await exchangeService.getTicker(sym)).price;
  } catch {
    /* */
  }
  const qty = exchangeService.roundQty(sym, freeBase);
  const { minNotional } = exchangeService.getLotSize(sym);
  const estimated = price > 0 && qty > 0 ? qty * price : 0;
  return { qty, price, minNotional, estimated };
}

/**
 * Market-sell free isolated base into quote (USDT) when Binance will accept the order.
 * Soft-skips only when clearly under min notional; otherwise attempts sell and
 * treats filter rejections as skip so settle can fall back to transfer + spot sell.
 */
export async function convertFreeBaseToUsdt(
  userId: string,
  symbol: string,
): Promise<{ actions: string[]; soldQty: number }> {
  await withLiveMarginExchange(userId);
  const actions: string[] = [];
  const sym = symbol.toUpperCase();
  const pair = await getPairOrThrow(sym);
  if (pairHasDebt(pair)) {
    throw new AppError(
      'MARGIN_DEBT',
      'Repay borrowed assets before converting isolated base',
      400,
    );
  }
  if (pair.quote.asset.toUpperCase() !== 'USDT') {
    return { actions, soldQty: 0 };
  }

  const freeBase = Math.max(0, pair.base.free);
  if (freeBase <= QTY_DUST) return { actions, soldQty: 0 };

  const { qty, price, minNotional, estimated } = await sizeSellableBaseQty(sym, freeBase);
  if (!(qty > 0)) return { actions, soldQty: 0 };
  // Soft skip only when clearly unsellable; try when near the floor (estimate can be off).
  if (price > 0 && estimated < minNotional * 0.9) {
    return { actions, soldQty: 0 };
  }

  try {
    await exchangeService.placeMarginOrder({
      symbol: sym,
      side: Side.SELL,
      type: OrderType.MARKET,
      quantity: qty,
      sideEffectType: 'NO_SIDE_EFFECT',
    });
  } catch (err) {
    if (isUnsellableFilterError(err)) return { actions, soldQty: 0 };
    throw err;
  }
  actions.push('convert_base');
  return { actions, soldQty: qty };
}

/**
 * After settle transfers base to Spot, market-sell only that transferred amount
 * (never the user's pre-existing Spot inventory of the same asset).
 */
export async function convertSpotBaseToUsdt(
  userId: string,
  symbol: string,
  baseAsset: string,
  maxQty: number,
): Promise<{ actions: string[]; soldQty: number }> {
  await withLiveMarginExchange(userId);
  const actions: string[] = [];
  const sym = symbol.toUpperCase();
  const asset = baseAsset.toUpperCase();
  if (asset === 'USDT' || !(maxQty > QTY_DUST)) return { actions, soldQty: 0 };

  const balances = await exchangeService.getBalances();
  const freeBase = Math.max(0, balances.find((b) => b.asset.toUpperCase() === asset)?.free ?? 0);
  const target = Math.min(freeBase, maxQty);
  if (target <= QTY_DUST) return { actions, soldQty: 0 };

  const { qty, price, minNotional, estimated } = await sizeSellableBaseQty(sym, target);
  if (!(qty > 0)) return { actions, soldQty: 0 };
  if (price > 0 && estimated < minNotional * 0.9) {
    return { actions, soldQty: 0 };
  }

  try {
    await exchangeService.placeOrder({
      symbol: sym,
      side: Side.SELL,
      type: OrderType.MARKET,
      quantity: qty,
    });
  } catch (err) {
    if (isUnsellableFilterError(err)) return { actions, soldQty: 0 };
    throw err;
  }
  actions.push('convert_spot_base');
  return { actions, soldQty: qty };
}

export async function settleMarginWallet(
  userId: string,
  symbol: string,
): Promise<{
  actions: string[];
  transferAmount: number;
  amounts: Record<string, number>;
  baseTransferAmount: number;
  soldQty: number;
  convertSkipped?: string;
}> {
  const sym = symbol.toUpperCase();
  const repay = await repayMarginWallet(userId, sym);
  const convertIso = await convertFreeBaseToUsdt(userId, sym);
  const pairAfterConvert = await getPairOrThrow(sym);
  const baseAsset = pairAfterConvert.base.asset;
  const xfer = await transferMarginToSpot(userId, sym);
  const transferredBase = xfer.amounts[baseAsset.toUpperCase()] ?? xfer.baseTransferAmount;
  const convertSpot = await convertSpotBaseToUsdt(userId, sym, baseAsset, transferredBase);
  const soldQty = convertIso.soldQty + convertSpot.soldQty;
  const convertSkipped =
    transferredBase > QTY_DUST && convertSpot.soldQty <= QTY_DUST
      ? `${baseAsset} below Binance min notional to sell; left on Spot`
      : undefined;
  return {
    actions: [
      ...repay.actions,
      ...convertIso.actions,
      ...xfer.actions,
      ...convertSpot.actions,
    ],
    transferAmount: xfer.amount,
    amounts: xfer.amounts,
    baseTransferAmount: xfer.baseTransferAmount,
    soldQty,
    convertSkipped,
  };
}

export async function reconcileIsolatedSymbol(
  userId: string,
  symbol: string,
): Promise<{ status: MarginSettlementStatus; message: string; actions: string[] }> {
  const actions: string[] = [];
  try {
    await withLiveMarginExchange(userId);
    let pair = await getPairOrThrow(symbol);
    const anySweepable = async (p: IsolatedMarginPairAccount): Promise<boolean> => {
      const quoteMax = await readMaxTransferable(p.quote.asset, symbol);
      const baseMax = await readMaxTransferable(p.base.asset, symbol);
      return quoteMax > transferDust(p.quote.asset) || baseMax > transferDust(p.base.asset);
    };

    if (!pairHasDebt(pair)) {
      const sweepable = await anySweepable(pair);
      const status: MarginSettlementStatus = sweepable ? 'sweepable' : 'settled';
      return {
        status,
        message: sweepable
          ? 'No debt; transferable assets can be swept to Spot'
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
    const sweepable = await anySweepable(pair);
    return {
      status: sweepable ? 'sweepable' : 'settled',
      message: sweepable
        ? 'Debt cleared; sweep transferable assets to Spot when ready'
        : 'Debt cleared',
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
