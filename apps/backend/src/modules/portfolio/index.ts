import { PositionStatus, TradingMode } from '@trading-os/shared';
import { Position } from '../../models/Position.js';
import { JournalEntry } from '../../models/JournalEntry.js';
import { getBinanceCredentials } from '../settings/index.js';
import { exchangeService } from '../exchange/index.js';
import { getRawSettings } from '../settings/index.js';
import {
  depositPaper,
  getPaperEquity,
  listPaperLedger,
  withdrawPaper,
} from './paper-equity.js';

export { depositPaper, getPaperEquity, listPaperLedger, withdrawPaper };

export async function getPortfolioSummary(userId: string) {
  const settings = await getRawSettings(userId);
  const positions = await Position.find({ userId, status: PositionStatus.OPEN }).lean();
  const mode = settings.trading?.mode === TradingMode.LIVE ? TradingMode.LIVE : TradingMode.PAPER;

  let balances: { asset: string; free: number; locked: number }[] = [];
  let equity = 0;
  let unrealized = positions.reduce((a, p) => a + (p.unrealizedPnl ?? 0), 0);
  let realizedPnl = 0;
  let startingBalance = 10_000;
  let adjustmentsNet = 0;
  let freeQuote = 0;

  if (mode === TradingMode.LIVE) {
    const creds = await getBinanceCredentials(userId);
    if (creds) {
      try {
        exchangeService.setCredentials(creds);
        balances = await exchangeService.getBalances();
        const usdt = balances.find((b) => b.asset === 'USDT');
        equity = (usdt?.free ?? 0) + (usdt?.locked ?? 0) + unrealized;
        freeQuote = usdt?.free ?? 0;
      } catch {
        const paper = await getPaperEquity(userId);
        equity = paper.equity;
        freeQuote = paper.freeQuote;
        unrealized = paper.unrealizedPnl;
        realizedPnl = paper.realizedPnl;
        startingBalance = paper.startingBalance;
        adjustmentsNet = paper.adjustmentsNet;
        balances = [{ asset: 'USDT', free: freeQuote, locked: Math.max(0, equity - freeQuote - unrealized) }];
      }
    } else {
      const paper = await getPaperEquity(userId);
      equity = paper.equity;
      freeQuote = paper.freeQuote;
      unrealized = paper.unrealizedPnl;
      realizedPnl = paper.realizedPnl;
      startingBalance = paper.startingBalance;
      adjustmentsNet = paper.adjustmentsNet;
      balances = [{ asset: 'USDT', free: freeQuote, locked: paper.deployed }];
    }
  } else {
    const paper = await getPaperEquity(userId);
    equity = paper.equity;
    freeQuote = paper.freeQuote;
    unrealized = paper.unrealizedPnl;
    realizedPnl = paper.realizedPnl;
    startingBalance = paper.startingBalance;
    adjustmentsNet = paper.adjustmentsNet;
    balances = [{ asset: 'USDT', free: freeQuote, locked: paper.deployed }];
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const todayJournal = await JournalEntry.find({
    userId,
    createdAt: { $gte: startOfDay },
  }).lean();
  const todayPnl = todayJournal.reduce((a, j) => a + (j.pnl ?? 0), 0);

  const exposure = positions.map((p) => ({
    symbol: p.symbol,
    notional: p.qty * p.currentPrice,
    side: p.side,
    unrealizedPnl: p.unrealizedPnl,
  }));
  const totalExposure = exposure.reduce((a, e) => a + e.notional, 0);
  const allocation = exposure.map((e) => ({
    ...e,
    pct: totalExposure > 0 ? e.notional / totalExposure : 0,
  }));

  return {
    equity,
    freeQuote,
    unrealizedPnl: unrealized,
    realizedPnl,
    startingBalance,
    adjustmentsNet,
    todayPnl,
    openPositions: positions.length,
    balances,
    exposure,
    allocation,
    mode,
  };
}
