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
  resolveMarkPrice,
} from './pricing.js';

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

  const riskResult = await validateRisk({
    userId,
    equity,
    freeQuote,
    risk: settings.risk as never,
    opportunity,
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

  let entryPrice = opportunity.entry;
  let binanceOrderIds: string[] = [];
  let fees = 0;

  if (mode === TradingMode.PAPER) {
    const ticker = getTickerPrice(opportunity.symbol);
    if (ticker != null) {
      entryPrice = ticker;
    } else {
      try {
        const candles = await marketDataService.getCandles(
          opportunity.symbol,
          opportunity.timeframe,
          1,
        );
        entryPrice = candles[candles.length - 1]?.close ?? opportunity.entry;
      } catch {
        // Offline / Binance unreachable: keep signal.entry
      }
    }
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
        : opts?.limitPrice ?? opportunity.entry;
    fees = entryPrice * qty * feeRate;
  }

  const trade = await Trade.create({
    userId,
    signalId,
    mode,
    symbol: opportunity.symbol,
    side: opportunity.side,
    orderType: opts?.orderType ?? OrderType.MARKET,
    qty,
    entryPrice,
    stopLoss: opportunity.stopLoss,
    takeProfit: opportunity.takeProfit,
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
    stopLoss: opportunity.stopLoss,
    takeProfit: opportunity.takeProfit,
    initialStopLoss: opportunity.stopLoss,
    highestPrice: entryPrice,
    lowestPrice: entryPrice,
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

  let price =
    exitPrice ??
    (await resolveMarkPrice(position.symbol, position.currentPrice)) ??
    position.currentPrice;

  if (trade.mode === TradingMode.LIVE) {
    const creds = await getBinanceCredentials(userId);
    if (creds) {
      exchangeService.setCredentials(creds);
      const closeSide = position.side === Side.BUY ? Side.SELL : Side.BUY;
      try {
        const order = await exchangeService.placeOrder({
          symbol: position.symbol,
          side: closeSide,
          type: OrderType.MARKET,
          quantity: qty,
        });
        trade.binanceOrderIds = [...(trade.binanceOrderIds ?? []), order.orderId];
        const fill = fillPriceFromOrder(order);
        if (fill != null) {
          price = fill;
          setTickerPrice(position.symbol, fill);
        }
      } catch (e) {
        void e;
      }
    }
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

  let price =
    exitPrice ??
    (await resolveMarkPrice(position.symbol, position.currentPrice)) ??
    position.currentPrice;

  if (trade.mode === TradingMode.LIVE) {
    const creds = await getBinanceCredentials(userId);
    if (creds) {
      exchangeService.setCredentials(creds);
      const closeSide = position.side === Side.BUY ? Side.SELL : Side.BUY;
      try {
        const order = await exchangeService.placeOrder({
          symbol: position.symbol,
          side: closeSide,
          type: OrderType.MARKET,
          quantity: position.qty,
        });
        trade.binanceOrderIds = [...(trade.binanceOrderIds ?? []), order.orderId];
        const fill = fillPriceFromOrder(order);
        if (fill != null) {
          price = fill;
          setTickerPrice(position.symbol, fill);
        }
      } catch (e) {
        // software close still recorded
        void e;
      }
    }
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

  return trade;
}

export async function listTrades(userId: string) {
  return Trade.find({ userId }).sort({ createdAt: -1 }).limit(200).lean();
}
