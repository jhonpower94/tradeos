import { ExecutionVenue, PositionStatus, TradingMode } from '@trading-os/shared';
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
  let startingBalance = 0;
  let adjustmentsNet = 0;
  let freeQuote = 0;
  let marginLevel: number | undefined;
  let marginDebtUsdt = 0;
  const executionVenue = settings.trading?.executionVenue ?? ExecutionVenue.MARGIN;

  if (mode === TradingMode.LIVE) {
    const creds = await getBinanceCredentials(userId);
    if (creds) {
      try {
        exchangeService.setCredentials(creds);
        balances = await exchangeService.getBalances();
        const usdt = balances.find((b) => b.asset === 'USDT');
        const spotUsdt = (usdt?.free ?? 0) + (usdt?.locked ?? 0);
        freeQuote = usdt?.free ?? 0;

        if (executionVenue !== ExecutionVenue.SPOT) {
          try {
            const sizing = await exchangeService.getMarginSizingQuote();
            freeQuote = sizing.freeQuote;
            const pairs = await exchangeService.getIsolatedMarginAccount();
            let isolatedQuoteNet = 0;
            const levels: number[] = [];
            for (const pair of pairs) {
              if (pair.quote.asset === 'USDT') {
                isolatedQuoteNet += pair.quote.netAsset;
                marginDebtUsdt += Math.max(0, pair.quote.borrowed + pair.quote.interest);
              }
              marginDebtUsdt += Math.max(0, pair.base.borrowed); // base qty owed; notional approx later if needed
              if (pair.marginLevel > 0) levels.push(pair.marginLevel);
            }
            // Spot USDT + isolated USDT net equity; open uPnL tracks base mark-to-market vs entry.
            equity = spotUsdt + isolatedQuoteNet + unrealized;
            if (levels.length) marginLevel = Math.min(...levels);
            if (isolatedQuoteNet !== 0 || marginDebtUsdt !== 0) {
              balances = [
                ...balances.filter((b) => b.asset !== 'USDT'),
                {
                  asset: 'USDT',
                  free: usdt?.free ?? 0,
                  locked: usdt?.locked ?? 0,
                },
                { asset: 'USDT_ISOLATED_NET', free: isolatedQuoteNet, locked: 0 },
              ];
            }
          } catch {
            equity = spotUsdt + unrealized;
          }
        } else {
          equity = spotUsdt + unrealized;
        }
      } catch {
        const paper = await getPaperEquity(userId);
        equity = paper.equity;
        freeQuote = paper.freeQuote;
        unrealized = paper.unrealizedPnl;
        realizedPnl = paper.realizedPnl;
        startingBalance = paper.startingBalance;
        adjustmentsNet = paper.adjustmentsNet;
        balances = [
          {
            asset: 'USDT',
            free: freeQuote,
            locked: Math.max(0, equity - freeQuote - unrealized),
          },
        ];
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

  const exposure = positions.map((pos) => ({
    symbol: pos.symbol,
    notional: pos.qty * pos.currentPrice,
    side: pos.side,
    unrealizedPnl: pos.unrealizedPnl,
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
    executionVenue,
    marginLevel,
    marginDebtUsdt,
  };
}

