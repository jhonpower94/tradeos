import {
  ApprovalMode,
  OrderType,
  PositionStatus,
  Side,
  SignalStatus,
  TradeStatus,
  TradingMode,
  type Opportunity,
} from '@trading-os/shared';
import { Trade } from '../../models/Trade.js';
import { Position } from '../../models/Position.js';
import { Signal } from '../../models/Signal.js';
import { getRawSettings, getBinanceCredentials } from '../settings/index.js';
import { softPrecheck, validateRisk } from '../risk/index.js';
import { exchangeService } from '../exchange/index.js';
import { getTickerPrice, marketDataService, setTickerPrice } from '../market-data/index.js';
import { computeAllIndicators, lastValid } from '../indicators/index.js';
import { AppError } from '../../utils/errors.js';
import { createJournalFromTrade } from '../journal/index.js';
import { notify } from '../notifications/index.js';
import { NotificationType } from '@trading-os/shared';
import { config } from '../../config/index.js';
import { getPaperEquity } from '../portfolio/paper-equity.js';
import {
  calcNetPnl,
  estimateExitFee,
  fillPriceFromOrder,
  resolveLiveExitPrice,
} from './pricing.js';
import { entryDriftExceeded, reanchorRiskLevels } from './levels.js';

/**
 * Resolve settlement price for a close.
 * - Caller-supplied exitPrice (auto exits): soft-close on that tick if live order fails.
 * - No exitPrice (manual close): require live mark; LIVE requires a successful fill.
 */
async function settleClosePrice(input: {
  userId: string;
  symbol: string;
  side: Side;
  qty: number;
  mode: TradingMode;
  exitPrice?: number;
}): Promise<{ price: number; orderId?: string }> {
  const requireLiveSettlement = input.exitPrice == null;

  let price: number;
  if (input.exitPrice != null && input.exitPrice > 0) {
    price = input.exitPrice;
  } else {
    const live = await resolveLiveExitPrice(input.symbol);
    if (live == null) {
      throw new AppError('NO_MARK_PRICE', 'Live market price unavailable', 503);
    }
    price = live;
  }

  if (input.mode !== TradingMode.LIVE) {
    return { price };
  }

  const creds = await getBinanceCredentials(input.userId);
  if (!creds) {
    if (requireLiveSettlement) {
      throw new AppError('NO_KEYS', 'Binance keys required for live close', 400);
    }
    return { price };
  }

  exchangeService.setCredentials(creds);
  const closeSide = input.side === Side.BUY ? Side.SELL : Side.BUY;

  try {
    const order = await exchangeService.placeOrder({
      symbol: input.symbol,
      side: closeSide,
      type: OrderType.MARKET,
      quantity: input.qty,
    });
    const fill = fillPriceFromOrder(order);
    if (fill != null) {
      setTickerPrice(input.symbol, fill);
      return { price: fill, orderId: order.orderId };
    }
    if (requireLiveSettlement) {
      throw new AppError('NO_FILL_PRICE', 'Close order returned no fill price', 502);
    }
    return { price, orderId: order.orderId };
  } catch (e) {
    if (requireLiveSettlement) {
      if (e instanceof AppError) throw e;
      throw new AppError(
        'CLOSE_ORDER_FAILED',
        e instanceof Error ? e.message : 'Live close order failed',
        502,
      );
    }
    // Auto exit with explicit tick price: keep software close on that mark.
    return { price };
  }
}

async function estimateEquity(userId: string, mode: TradingMode): Promise<{ equity: number; freeQuote: number }> {
  if (mode === TradingMode.LIVE) {
    try {
      const creds = await getBinanceCredentials(userId);
      if (creds) {
        exchangeService.setCredentials(creds);
        const balances = await exchangeService.getBalances();
        const usdt = balances.find((b) => b.asset === 'USDT');
        const free = usdt?.free ?? 0;
        return { equity: free, freeQuote: free };
      }
    } catch {
      // fall through to paper accounting
    }
  }
  const paper = await getPaperEquity(userId);
  return { equity: paper.equity, freeQuote: paper.freeQuote };
}

export async function executeOpportunity(
  userId: string,
  opportunity: Opportunity,
  signalId?: string,
  opts?: { orderType?: OrderType; limitPrice?: number },
) {
  const settings = await getRawSettings(userId);
  const mode = settings.trading?.mode === TradingMode.LIVE ? TradingMode.LIVE : TradingMode.PAPER;
  const { equity, freeQuote } = await estimateEquity(userId, mode);

  let spreadBps: number | undefined;
  let volume24h: number | undefined;
  try {
    const ticker = await exchangeService.getTicker(opportunity.symbol);
    if (ticker.bid && ticker.ask) {
      spreadBps = ((ticker.ask - ticker.bid) / ticker.price) * 10_000;
    }
    volume24h = ticker.volume24h;
    if (ticker.price) setTickerPrice(opportunity.symbol, ticker.price);
  } catch {
    // optional market quality inputs
  }

  const pre = await softPrecheck(userId, opportunity, settings.risk as never, equity);
  if (!pre.ok) {
    if (signalId) {
      await Signal.findByIdAndUpdate(signalId, {
        status: SignalStatus.REJECTED,
        rejectReason: pre.reason ?? 'Soft precheck failed',
      });
    }
    throw new AppError('ENTRY_DRIFT', pre.reason ?? 'Soft precheck failed', 400);
  }

  let atr: number | undefined;
  try {
    const candles = await marketDataService.getCandles(
      opportunity.symbol,
      opportunity.timeframe,
      50,
    );
    if (candles.length >= 15) {
      const indicators = computeAllIndicators(candles);
      atr = lastValid(indicators.atr14) ?? undefined;
    }
  } catch {
    // ATR optional when market data unavailable
  }

  // Size off expected fill so notional cap uses live price; SL/TP distances preserved.
  let expectedEntry = opportunity.entry;
  const cachedTicker = getTickerPrice(opportunity.symbol);
  if (cachedTicker != null) {
    expectedEntry = cachedTicker;
  } else {
    try {
      const candles = await marketDataService.getCandles(
        opportunity.symbol,
        opportunity.timeframe,
        1,
      );
      expectedEntry = candles[candles.length - 1]?.close ?? opportunity.entry;
    } catch {
      // keep signal.entry
    }
  }

  const expectedLevels = reanchorRiskLevels(
    opportunity.side,
    expectedEntry,
    opportunity.entry,
    opportunity.stopLoss,
    opportunity.takeProfit,
  );
  const sizedOpportunity: Opportunity = {
    ...opportunity,
    entry: expectedEntry,
    stopLoss: expectedLevels.stopLoss,
    takeProfit: expectedLevels.takeProfit,
    riskReward: expectedLevels.riskReward > 0 ? expectedLevels.riskReward : opportunity.riskReward,
  };

  const riskResult = await validateRisk({
    userId,
    equity,
    freeQuote,
    risk: settings.risk as never,
    opportunity: sizedOpportunity,
    atr,
    spreadBps,
    volume24h,
  });

  if (!riskResult.ok || !riskResult.qty) {
    if (signalId) {
      await Signal.findByIdAndUpdate(signalId, {
        status: SignalStatus.REJECTED,
        rejectReason: riskResult.reasons.join('; '),
      });
    }
    throw new AppError('RISK_REJECTED', riskResult.reasons.join('; '), 400, riskResult);
  }

  const qty = riskResult.qty;
  const feeRate = settings.trading?.feeRate ?? config.feeRate;

  let entryPrice = expectedEntry;
  let binanceOrderIds: string[] = [];
  let fees = 0;

  if (mode === TradingMode.PAPER) {
    fees = entryPrice * qty * feeRate;
  } else {
    const creds = await getBinanceCredentials(userId);
    if (!creds) throw new AppError('NO_KEYS', 'Binance keys required for live trading', 400);
    exchangeService.setCredentials(creds);
    const order = await exchangeService.placeOrder({
      symbol: opportunity.symbol,
      side: opportunity.side,
      type: opts?.orderType ?? OrderType.MARKET,
      quantity: qty,
      price: opts?.limitPrice,
    });
    binanceOrderIds = [order.orderId];
    entryPrice =
      order.executedQty > 0
        ? order.cummulativeQuoteQty / order.executedQty
        : opts?.limitPrice ?? expectedEntry;
    fees = entryPrice * qty * feeRate;
  }

  if (entryDriftExceeded(opportunity.entry, entryPrice)) {
    if (signalId) {
      await Signal.findByIdAndUpdate(signalId, {
        status: SignalStatus.REJECTED,
        rejectReason: 'Entry drifted more than 2% from signal price',
      });
    }
    // Live fill already happened — flatten immediately so oversized risk is not held.
    if (mode === TradingMode.LIVE && binanceOrderIds.length > 0) {
      try {
        await exchangeService.placeOrder({
          symbol: opportunity.symbol,
          side: opportunity.side === Side.BUY ? Side.SELL : Side.BUY,
          type: OrderType.MARKET,
          quantity: qty,
        });
      } catch {
        // best-effort flatten; still reject the open
      }
    }
    throw new AppError('ENTRY_DRIFT', 'Entry drifted more than 2% from signal price', 400);
  }

  const levels = reanchorRiskLevels(
    opportunity.side,
    entryPrice,
    opportunity.entry,
    opportunity.stopLoss,
    opportunity.takeProfit,
  );

  const trade = await Trade.create({
    userId,
    signalId,
    mode,
    symbol: opportunity.symbol,
    side: opportunity.side,
    orderType: opts?.orderType ?? OrderType.MARKET,
    qty,
    entryPrice,
    stopLoss: levels.stopLoss,
    takeProfit: levels.takeProfit,
    status: TradeStatus.OPEN,
    binanceOrderIds,
    fees,
    entryReason: `Strategy ${opportunity.primaryStrategy} confidence ${opportunity.confidence}`,
    openedAt: new Date(),
  });

  await Position.create({
    userId,
    tradeId: trade._id,
    symbol: opportunity.symbol,
    side: opportunity.side,
    qty,
    entryPrice,
    currentPrice: entryPrice,
    unrealizedPnl: 0,
    stopLoss: levels.stopLoss,
    takeProfit: levels.takeProfit,
    initialStopLoss: levels.initialStopLoss,
    highestPrice: entryPrice,
    lowestPrice: entryPrice,
    peakUnrealizedPnl: 0,
    troughUnrealizedPnl: 0,
    partialTpDone: false,
    status: PositionStatus.OPEN,
    openedAt: new Date(),
  });

  if (signalId) {
    await Signal.findByIdAndUpdate(signalId, { status: SignalStatus.EXECUTED });
  }

  await notify(userId, NotificationType.TRADE_EXECUTED, {
    title: 'Trade executed',
    body: `${opportunity.side} ${opportunity.symbol} qty=${qty} @ ${entryPrice}`,
    payload: { tradeId: trade._id, mode },
  });

  return trade;
}

export async function handleSignalApproval(userId: string, signalId: string, body?: {
  orderType?: OrderType;
  limitPrice?: number;
}) {
  const signal = await Signal.findOne({ _id: signalId, userId });
  if (!signal) throw new AppError('NOT_FOUND', 'Signal not found', 404);
  if (signal.status !== SignalStatus.RANKED && signal.status !== SignalStatus.APPROVED) {
    throw new AppError('INVALID_STATUS', `Cannot approve signal in status ${signal.status}`, 400);
  }

  const opportunity: Opportunity = {
    symbol: signal.symbol,
    timeframe: signal.timeframe as Opportunity['timeframe'],
    side: signal.side as Side,
    confidence: signal.confidence,
    entry: signal.entry,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    riskReward: signal.riskReward,
    strategyIds: (signal.strategyIds ?? []) as Opportunity['strategyIds'],
    primaryStrategy: signal.primaryStrategy as Opportunity['primaryStrategy'],
    evidence: (signal.evidence ?? []) as Opportunity['evidence'],
    regime: signal.regime as Opportunity['regime'],
    estimatedDuration: signal.estimatedDuration ?? undefined,
  };

  await Signal.findByIdAndUpdate(signalId, { status: SignalStatus.APPROVED });
  try {
    return await executeOpportunity(userId, opportunity, signalId, body);
  } catch (err) {
    const current = await Signal.findById(signalId).lean();
    if (current?.status === SignalStatus.APPROVED) {
      await Signal.findByIdAndUpdate(signalId, { status: SignalStatus.RANKED });
    }
    throw err;
  }
}

export async function rejectSignal(userId: string, signalId: string, reason?: string) {
  const signal = await Signal.findOneAndUpdate(
    { _id: signalId, userId },
    { status: SignalStatus.REJECTED, rejectReason: reason ?? 'User rejected' },
    { new: true },
  );
  if (!signal) throw new AppError('NOT_FOUND', 'Signal not found', 404);
  return signal;
}

export async function processAutoSignals(userId: string, opportunities: Opportunity[]) {
  const settings = await getRawSettings(userId);
  const approval = settings.trading?.approval ?? ApprovalMode.MANUAL;
  if (approval !== ApprovalMode.AUTO) return;

  for (const o of opportunities.slice(0, 3)) {
    try {
      const signal = await Signal.findOne({
        userId,
        symbol: o.symbol,
        timeframe: o.timeframe,
        side: o.side,
        status: SignalStatus.RANKED,
      });
      await executeOpportunity(userId, o, signal ? String(signal._id) : undefined);
    } catch {
      // continue
    }
  }
}

export async function partialClosePosition(
  userId: string,
  positionId: string,
  closeQty: number,
  reason: string,
  exitPrice?: number,
) {
  const position = await Position.findOne({ _id: positionId, userId, status: PositionStatus.OPEN });
  if (!position) throw new AppError('NOT_FOUND', 'Position not found', 404);

  const qty = Math.min(Math.max(0, closeQty), position.qty);
  const remaining = position.qty - qty;
  // Dust remainder → full close instead
  if (qty <= 0 || remaining <= position.qty * 1e-8) {
    return closePosition(userId, positionId, reason, exitPrice);
  }

  const trade = await Trade.findById(position.tradeId);
  if (!trade) throw new AppError('NOT_FOUND', 'Trade not found', 404);

  const settings = await getRawSettings(userId);
  const feeRate = settings.trading?.feeRate ?? config.feeRate;

  const settled = await settleClosePrice({
    userId,
    symbol: position.symbol,
    side: position.side as Side,
    qty,
    mode: trade.mode as TradingMode,
    exitPrice,
  });
  const price = settled.price;
  if (settled.orderId) {
    trade.binanceOrderIds = [...(trade.binanceOrderIds ?? []), settled.orderId];
  }

  const exitFee = estimateExitFee(price, qty, feeRate);
  const slicePnl = calcNetPnl(position.side as Side, position.entryPrice, price, qty, feeRate);

  trade.realizedPnl = (trade.realizedPnl ?? 0) + slicePnl;
  trade.fees = (trade.fees ?? 0) + exitFee;
  trade.qty = remaining;
  await trade.save();

  position.qty = remaining;
  position.currentPrice = price;
  position.unrealizedPnl = calcNetPnl(
    position.side as Side,
    position.entryPrice,
    price,
    remaining,
    feeRate,
  );
  await position.save();

  await createJournalFromTrade(trade, position, reason, {
    qty,
    pnl: slicePnl,
    exit: price,
  });
  await notify(userId, NotificationType.TRADE_CLOSED, {
    title: 'Partial take profit',
    body: `${position.symbol} closed ${qty} @ ${price} PnL ${slicePnl.toFixed(2)} — ${reason}`,
    payload: { tradeId: trade._id, pnl: slicePnl, partial: true },
  });

  return trade;
}

export async function closePosition(
  userId: string,
  positionId: string,
  reason: string,
  exitPrice?: number,
) {
  const position = await Position.findOne({ _id: positionId, userId, status: PositionStatus.OPEN });
  if (!position) throw new AppError('NOT_FOUND', 'Position not found', 404);

  const trade = await Trade.findById(position.tradeId);
  if (!trade) throw new AppError('NOT_FOUND', 'Trade not found', 404);

  const settings = await getRawSettings(userId);
  const feeRate = settings.trading?.feeRate ?? config.feeRate;

  const settled = await settleClosePrice({
    userId,
    symbol: position.symbol,
    side: position.side as Side,
    qty: position.qty,
    mode: trade.mode as TradingMode,
    exitPrice,
  });
  const price = settled.price;
  if (settled.orderId) {
    trade.binanceOrderIds = [...(trade.binanceOrderIds ?? []), settled.orderId];
  }

  const exitFee = estimateExitFee(price, position.qty, feeRate);
  const slicePnl = calcNetPnl(
    position.side as Side,
    position.entryPrice,
    price,
    position.qty,
    feeRate,
  );

  trade.exitPrice = price;
  trade.realizedPnl = (trade.realizedPnl ?? 0) + slicePnl;
  trade.fees = (trade.fees ?? 0) + exitFee;
  trade.status = TradeStatus.CLOSED;
  trade.exitReason = reason;
  trade.closedAt = new Date();
  await trade.save();

  const closedQty = position.qty;
  position.status = PositionStatus.CLOSED;
  position.currentPrice = price;
  position.unrealizedPnl = 0;
  position.closedAt = new Date();
  await position.save();

  await createJournalFromTrade(trade, position, reason, {
    qty: closedQty,
    pnl: slicePnl,
    exit: price,
  });
  await notify(userId, NotificationType.TRADE_CLOSED, {
    title: 'Trade closed',
    body: `${position.symbol} PnL ${slicePnl.toFixed(2)} — ${reason}`,
    payload: { tradeId: trade._id, pnl: slicePnl },
  });

  const freedSymbol = position.symbol;
  void import('../scanner/index.js')
    .then(({ scannerService }) => scannerService.scanUserSymbol(userId, freedSymbol))
    .catch((e) => console.error('Post-close rescan failed', e));

  return trade;
}

export async function listTrades(userId: string) {
  return Trade.find({ userId }).sort({ createdAt: -1 }).limit(200).lean();
}
