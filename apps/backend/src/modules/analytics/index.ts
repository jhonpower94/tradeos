import { JournalEntry } from '../../models/JournalEntry.js';
import { AnalyticsSnapshot } from '../../models/AnalyticsSnapshot.js';
import { getPaperEquity } from '../portfolio/paper-equity.js';

export async function computeAnalytics(userId: string) {
  const entries = await JournalEntry.find({ userId }).sort({ createdAt: 1 }).lean();
  const paper = await getPaperEquity(userId);
  const baseEquity = paper.startingBalance + paper.adjustmentsNet;
  const total = entries.length;
  if (!total) {
    return {
      winRate: 0,
      lossRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      averageProfit: 0,
      averageLoss: 0,
      sharpeRatio: 0,
      netPnl: 0,
      tradeCount: 0,
      bestStrategy: null,
      worstStrategy: null,
      byStrategy: {},
      monthlyReturns: [],
      equityCurve: [{ t: Date.now(), equity: baseEquity + paper.unrealizedPnl }],
    };
  }

  const wins = entries.filter((e) => (e.pnl ?? 0) > 0);
  const losses = entries.filter((e) => (e.pnl ?? 0) < 0);
  const grossProfit = wins.reduce((a, e) => a + (e.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, e) => a + (e.pnl ?? 0), 0));
  const netPnl = entries.reduce((a, e) => a + (e.pnl ?? 0), 0);

  let equity = baseEquity;
  let peak = equity;
  let maxDd = 0;
  const equityCurve: { t: number; equity: number }[] = [];
  const returns: number[] = [];

  for (const e of entries) {
    const prev = equity;
    equity += e.pnl ?? 0;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak > 0 ? (peak - equity) / peak : 0);
    returns.push(prev > 0 ? (e.pnl ?? 0) / prev : 0);
    equityCurve.push({
      t: new Date((e as { createdAt?: Date }).createdAt ?? Date.now()).getTime(),
      equity,
    });
  }

  const mean = returns.reduce((a, r) => a + r, 0) / returns.length;
  const variance =
    returns.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(returns.length - 1, 1);
  const sharpeRatio = variance > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252) : 0;

  const byStrategy: Record<
    string,
    { trades: number; pnl: number; wins: number }
  > = {};
  for (const e of entries) {
    const key = e.strategy ?? 'unknown';
    byStrategy[key] ??= { trades: 0, pnl: 0, wins: 0 };
    byStrategy[key].trades++;
    byStrategy[key].pnl += e.pnl ?? 0;
    if ((e.pnl ?? 0) > 0) byStrategy[key].wins++;
  }

  const ranked = Object.entries(byStrategy).sort((a, b) => b[1].pnl - a[1].pnl);
  const bestStrategy = ranked[0]?.[0] ?? null;
  const worstStrategy = ranked[ranked.length - 1]?.[0] ?? null;

  const monthlyMap = new Map<string, number>();
  for (const e of entries) {
    const d = new Date((e as { createdAt?: Date }).createdAt ?? Date.now());
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + (e.pnl ?? 0));
  }
  const monthlyReturns = [...monthlyMap.entries()].map(([month, pnl]) => ({ month, pnl }));

  const overview = {
    winRate: wins.length / total,
    lossRate: losses.length / total,
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss,
    maxDrawdown: maxDd,
    averageProfit: wins.length ? grossProfit / wins.length : 0,
    averageLoss: losses.length ? grossLoss / losses.length : 0,
    sharpeRatio,
    netPnl,
    tradeCount: total,
    bestStrategy,
    worstStrategy,
    byStrategy,
    monthlyReturns,
    equityCurve,
  };

  const date = new Date().toISOString().slice(0, 10);
  await AnalyticsSnapshot.findOneAndUpdate(
    { userId, date },
    {
      $set: {
        winRate: overview.winRate,
        lossRate: overview.lossRate,
        profitFactor: overview.profitFactor === Infinity ? 999 : overview.profitFactor,
        sharpe: overview.sharpeRatio,
        drawdown: overview.maxDrawdown,
        netPnl: overview.netPnl,
        tradeCount: overview.tradeCount,
        byStrategy: overview.byStrategy,
      },
    },
    { upsert: true },
  );

  return overview;
}
