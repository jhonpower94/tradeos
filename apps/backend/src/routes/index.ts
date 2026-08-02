import type { FastifyInstance } from 'fastify';
import { AppError } from '../utils/errors.js';
import { getUserId, loginUser, registerUser, issueRefreshToken, rotateRefreshToken, clearRefreshToken } from '../modules/auth/index.js';
import {
  getSettings,
  updateSettings,
  updateBinanceKeys,
  testBinanceConnection,
} from '../modules/settings/index.js';
import { exchangeService } from '../modules/exchange/index.js';
import { marketDataService } from '../modules/market-data/index.js';
import { candlesQuerySchema, approveSignalSchema, createTradeSchema, backtestRequestSchema } from '@trading-os/shared';
import { scannerService } from '../modules/scanner/index.js';
import { listOpportunities } from '../modules/ranking/index.js';
import { Signal } from '../models/Signal.js';
import {
  handleSignalApproval,
  rejectSignal,
  listTrades,
  closePosition,
  executeOpportunity,
} from '../modules/trade/index.js';
import { listPositions, updatePositionLevels } from '../modules/position/index.js';
import {
  getPositionMarketContext,
  listOpenPositionsMarketContext,
} from '../modules/position/context.js';
import { getPortfolioSummary, depositPaper, withdrawPaper, listPaperLedger } from '../modules/portfolio/index.js';
import { listJournal, getJournalEntry } from '../modules/journal/index.js';
import { computeAnalytics } from '../modules/analytics/index.js';
import { listNotifications, markRead, notify } from '../modules/notifications/index.js';
import { NotificationType, Side, OrderType, type Opportunity } from '@trading-os/shared';
import { runBacktest, listBacktests, getBacktest } from '../modules/backtest/index.js';
import { strategyRegistry } from '../modules/strategies/index.js';

async function auth(req: { jwtVerify: () => Promise<void> }) {
  await req.jwtVerify();
}

export async function registerRoutes(app: FastifyInstance) {
  app.get('/api/v1/health', async () => ({
    ok: true,
    service: 'trading-os',
    ts: Date.now(),
  }));

  // Auth
  app.post('/api/v1/auth/register', async (req, reply) => {
    const body = req.body as { email: string; password: string };
    const user = await registerUser(body.email, body.password);
    const accessToken = app.jwt.sign({ sub: String(user._id), email: user.email });
    const refreshToken = await issueRefreshToken(String(user._id));
    return reply.code(201).send({
      accessToken,
      refreshToken,
      user: { id: user._id, email: user.email },
    });
  });

  app.post('/api/v1/auth/login', async (req) => {
    const body = req.body as { email: string; password: string };
    const user = await loginUser(body.email, body.password);
    const accessToken = app.jwt.sign({ sub: String(user._id), email: user.email });
    const refreshToken = await issueRefreshToken(String(user._id));
    return { accessToken, refreshToken, user: { id: user._id, email: user.email } };
  });

  app.post('/api/v1/auth/refresh', async (req) => {
    const body = req.body as { refreshToken?: string };
    if (!body.refreshToken) throw new AppError('UNAUTHORIZED', 'Refresh token required', 401);
    const { user, refreshToken } = await rotateRefreshToken(body.refreshToken);
    const accessToken = app.jwt.sign({ sub: String(user._id), email: user.email });
    return {
      accessToken,
      refreshToken,
      user: { id: user._id, email: user.email },
    };
  });

  app.post('/api/v1/auth/logout', async (req) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    let userId: string | undefined;
    try {
      await req.jwtVerify();
      userId = getUserId(req);
    } catch {
      // optional access token
    }
    await clearRefreshToken(userId, body.refreshToken);
    return { ok: true };
  });

  app.get('/api/v1/auth/me', { preHandler: auth }, async (req) => {
    const userId = getUserId(req);
    return { id: userId, email: (req.user as { email?: string }).email };
  });

  // Settings
  app.get('/api/v1/settings', { preHandler: auth }, async (req) => getSettings(getUserId(req)));
  app.patch('/api/v1/settings', { preHandler: auth }, async (req) =>
    updateSettings(getUserId(req), req.body),
  );
  app.put('/api/v1/settings/binance', { preHandler: auth }, async (req) =>
    updateBinanceKeys(getUserId(req), req.body),
  );
  app.post('/api/v1/settings/binance/test', { preHandler: auth }, async (req) =>
    testBinanceConnection(getUserId(req)),
  );

  // Market
  app.get('/api/v1/market/symbols', { preHandler: auth }, async () => ({
    symbols: await exchangeService.getUsdtSymbols(),
  }));
  app.get('/api/v1/market/ticker/:symbol', { preHandler: auth }, async (req) => {
    const { symbol } = req.params as { symbol: string };
    return exchangeService.getTicker(symbol);
  });
  app.get('/api/v1/market/candles', { preHandler: auth }, async (req) => {
    const q = candlesQuerySchema.parse(req.query);
    const candles = await marketDataService.getCandles(q.symbol, q.interval, q.limit);
    return { candles };
  });
  app.get('/api/v1/market/orderbook/:symbol', { preHandler: auth }, async (req) => {
    const { symbol } = req.params as { symbol: string };
    return exchangeService.getOrderBook(symbol);
  });

  // Scanner
  app.get('/api/v1/scanner/opportunities', { preHandler: auth }, async (req) => {
    const userId = getUserId(req);
    const q = req.query as {
      minConfidence?: string;
      timeframe?: string;
      side?: Side;
      search?: string;
    };
    const items = await listOpportunities(userId, {
      minConfidence: q.minConfidence ? Number(q.minConfidence) : undefined,
      timeframe: q.timeframe,
      side: q.side,
      search: q.search,
    });
    return { items };
  });
  app.get('/api/v1/scanner/status', { preHandler: auth }, async () => scannerService.getStatus());
  app.post('/api/v1/scanner/start', { preHandler: auth }, async () => {
    scannerService.start();
    return scannerService.getStatus();
  });
  app.post('/api/v1/scanner/stop', { preHandler: auth }, async () => {
    scannerService.stop();
    return scannerService.getStatus();
  });

  // Signals — default: active ranked board (same as scanner opportunities)
  app.get('/api/v1/signals', { preHandler: auth }, async (req) => {
    const userId = getUserId(req);
    const q = req.query as { view?: string; minConfidence?: string };
    if (q.view === 'history') {
      const items = await Signal.find({ userId })
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(100)
        .lean();
      return { items, view: 'history' };
    }
    const items = await listOpportunities(userId, {
      minConfidence: q.minConfidence ? Number(q.minConfidence) : undefined,
    });
    return { items, view: 'ranked' };
  });
  app.get('/api/v1/signals/:id', { preHandler: auth }, async (req) => {
    const item = await Signal.findOne({ _id: (req.params as { id: string }).id, userId: getUserId(req) }).lean();
    if (!item) throw new AppError('NOT_FOUND', 'Signal not found', 404);
    return item;
  });
  app.post('/api/v1/signals/:id/approve', { preHandler: auth }, async (req) => {
    const body = approveSignalSchema.parse(req.body ?? {});
    const trade = await handleSignalApproval(getUserId(req), (req.params as { id: string }).id, {
      orderType: body.orderType as OrderType,
      limitPrice: body.limitPrice,
    });
    return { trade };
  });
  app.post('/api/v1/signals/:id/reject', { preHandler: auth }, async (req) => {
    const signal = await rejectSignal(getUserId(req), (req.params as { id: string }).id);
    return { signal };
  });

  // Trades
  app.get('/api/v1/trades', { preHandler: auth }, async (req) => ({
    items: await listTrades(getUserId(req)),
  }));
  app.post('/api/v1/trades', { preHandler: auth }, async (req) => {
    const body = createTradeSchema.parse(req.body);
    const opportunity: Opportunity = {
      symbol: body.symbol,
      timeframe: '15m' as Opportunity['timeframe'],
      side: body.side,
      confidence: 100,
      entry: body.price ?? 0,
      stopLoss: body.stopLoss ?? 0,
      takeProfit: body.takeProfit ?? 0,
      riskReward: 2,
      strategyIds: [],
      primaryStrategy: 'breakout',
      evidence: [],
      regime: 'unknown' as Opportunity['regime'],
    };
    // fetch price if needed
    if (!body.price) {
      const t = await exchangeService.getTicker(body.symbol);
      opportunity.entry = t.price;
      if (!body.stopLoss) {
        opportunity.stopLoss =
          body.side === Side.BUY ? t.price * 0.98 : t.price * 1.02;
      }
      if (!body.takeProfit) {
        opportunity.takeProfit =
          body.side === Side.BUY ? t.price * 1.04 : t.price * 0.96;
      }
      opportunity.riskReward =
        Math.abs(opportunity.takeProfit - opportunity.entry) /
        Math.abs(opportunity.entry - opportunity.stopLoss);
    }
    const trade = await executeOpportunity(getUserId(req), opportunity, undefined, {
      orderType: body.orderType as OrderType,
      limitPrice: body.price,
    });
    return { trade };
  });
  app.post('/api/v1/trades/:id/close', { preHandler: auth }, async (req) => {
    const { Position } = await import('../models/Position.js');
    const { PositionStatus } = await import('@trading-os/shared');
    const tradeId = (req.params as { id: string }).id;
    const pos = await Position.findOne({
      tradeId,
      userId: getUserId(req),
      status: PositionStatus.OPEN,
    });
    if (!pos) throw new AppError('NOT_FOUND', 'Open position not found', 404);
    const trade = await closePosition(getUserId(req), String(pos._id), 'Manual close');
    return { trade };
  });

  // Positions
  app.get('/api/v1/positions', { preHandler: auth }, async (req) => ({
    items: await listPositions(getUserId(req)),
  }));
  app.get('/api/v1/positions/context', { preHandler: auth }, async (req) => ({
    items: await listOpenPositionsMarketContext(getUserId(req)),
  }));
  app.get('/api/v1/positions/:id/context', { preHandler: auth }, async (req) =>
    getPositionMarketContext(getUserId(req), (req.params as { id: string }).id),
  );
  app.patch('/api/v1/positions/:id', { preHandler: auth }, async (req) => {
    const body = req.body as {
      stopLoss?: number;
      takeProfit?: number;
      trailingStopPct?: number;
    };
    return updatePositionLevels(getUserId(req), (req.params as { id: string }).id, body);
  });

  // Portfolio
  app.get('/api/v1/portfolio/summary', { preHandler: auth }, async (req) =>
    getPortfolioSummary(getUserId(req)),
  );
  app.get('/api/v1/portfolio/balances', { preHandler: auth }, async (req) => {
    const s = await getPortfolioSummary(getUserId(req));
    return { balances: s.balances };
  });
  app.get('/api/v1/portfolio/exposure', { preHandler: auth }, async (req) => {
    const s = await getPortfolioSummary(getUserId(req));
    return { exposure: s.exposure, allocation: s.allocation };
  });
  app.get('/api/v1/portfolio/paper/ledger', { preHandler: auth }, async (req) => ({
    items: await listPaperLedger(getUserId(req)),
  }));
  app.post('/api/v1/portfolio/paper/deposit', { preHandler: auth }, async (req) => {
    const body = req.body as { amount?: number; note?: string };
    const amount = Number(body.amount);
    if (!(amount > 0)) throw new AppError('INVALID_AMOUNT', 'Deposit amount must be positive', 400);
    return depositPaper(getUserId(req), amount, body.note);
  });
  app.post('/api/v1/portfolio/paper/withdraw', { preHandler: auth }, async (req) => {
    const body = req.body as { amount?: number; note?: string };
    const amount = Number(body.amount);
    if (!(amount > 0)) throw new AppError('INVALID_AMOUNT', 'Withdraw amount must be positive', 400);
    return withdrawPaper(getUserId(req), amount, body.note);
  });

  // Journal
  app.get('/api/v1/journal', { preHandler: auth }, async (req) => ({
    items: await listJournal(getUserId(req)),
  }));
  app.get('/api/v1/journal/:id', { preHandler: auth }, async (req) => {
    const item = await getJournalEntry(getUserId(req), (req.params as { id: string }).id);
    if (!item) throw new AppError('NOT_FOUND', 'Not found', 404);
    return item;
  });

  // Analytics
  app.get('/api/v1/analytics/overview', { preHandler: auth }, async (req) =>
    computeAnalytics(getUserId(req)),
  );
  app.get('/api/v1/analytics/strategies', { preHandler: auth }, async (req) => {
    const a = await computeAnalytics(getUserId(req));
    return { byStrategy: a.byStrategy, best: a.bestStrategy, worst: a.worstStrategy };
  });
  app.get('/api/v1/analytics/equity', { preHandler: auth }, async (req) => {
    const a = await computeAnalytics(getUserId(req));
    return { equityCurve: a.equityCurve, monthlyReturns: a.monthlyReturns };
  });

  // Backtest
  app.post('/api/v1/backtest', { preHandler: auth }, async (req) => {
    const body = backtestRequestSchema.parse(req.body);
    const run = await runBacktest({
      userId: getUserId(req),
      strategyId: body.strategyId as import('@trading-os/shared').StrategyId,
      symbol: body.symbol,
      interval: body.interval,
      startTime: body.startTime,
      endTime: body.endTime,
      initialCapital: body.initialCapital,
      strategyParams: body.params,
    });
    return { run };
  });
  app.get('/api/v1/backtest', { preHandler: auth }, async (req) => ({
    items: await listBacktests(getUserId(req)),
  }));
  app.get('/api/v1/backtest/:id', { preHandler: auth }, async (req) => {
    const item = await getBacktest(getUserId(req), (req.params as { id: string }).id);
    if (!item) throw new AppError('NOT_FOUND', 'Not found', 404);
    return item;
  });

  // Notifications
  app.get('/api/v1/notifications', { preHandler: auth }, async (req) => ({
    items: await listNotifications(getUserId(req)),
  }));
  app.patch('/api/v1/notifications/:id/read', { preHandler: auth }, async (req) =>
    markRead(getUserId(req), (req.params as { id: string }).id),
  );
  app.post('/api/v1/notifications/test', { preHandler: auth }, async (req) => {
    await notify(getUserId(req), NotificationType.TRADE_SIGNAL, {
      title: 'Test notification',
      body: 'Trading OS notification test',
    });
    return { ok: true };
  });

  // Strategies metadata
  app.get('/api/v1/strategies', { preHandler: auth }, async () => ({
    items: strategyRegistry.getAll().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
  }));
}
