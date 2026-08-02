import {
  Decision,
  Side,
  type BacktestMetrics,
  type StrategyId,
  Timeframe,
  isStrategyCompatibleWithRegime,
} from '@trading-os/shared';
import { BacktestRun } from '../../models/BacktestRun.js';
import { exchangeService } from '../exchange/index.js';
import { computeAllIndicators } from '../indicators/index.js';
import { detectPatterns } from '../patterns/index.js';
import { strategyRegistry } from '../strategies/index.js';
import { detectRegime } from '../regime/index.js';
import { AppError } from '../../utils/errors.js';

interface OpenSim {
  side: Side;
  entry: number;
  sl: number;
  tp: number;
  qty: number;
  openIndex: number;
}

export async function runBacktest(params: {
  userId: string;
  strategyId: StrategyId;
  symbol: string;
  interval: Timeframe;
  startTime: number;
  endTime: number;
  initialCapital?: number;
  strategyParams?: Record<string, unknown>;
}) {
  const run = await BacktestRun.create({
    userId: params.userId,
    strategyId: params.strategyId,
    symbol: params.symbol,
    interval: params.interval,
    startTime: params.startTime,
    endTime: params.endTime,
    initialCapital: params.initialCapital ?? 10_000,
    params: params.strategyParams,
    status: 'running',
  });

  try {
    const candles = await exchangeService.getCandlesRange(
      params.symbol,
      params.interval,
      params.startTime,
      params.endTime,
    );
    if (candles.length < 50) {
      throw new AppError('INSUFFICIENT_DATA', 'Not enough candle data', 400);
    }

    const strategy = strategyRegistry.get(params.strategyId);
    if (!strategy) throw new AppError('UNKNOWN_STRATEGY', 'Strategy not found', 400);

    const capital0 = params.initialCapital ?? 10_000;
    let equity = capital0;
    let peak = capital0;
    let maxDd = 0;
    const trades: { pnl: number }[] = [];
    const equityCurve: { t: number; equity: number }[] = [];
    let open: OpenSim | null = null;
    const feeRate = 0.001;
    const warmup = 60;

    for (let i = warmup; i < candles.length; i++) {
      const window = candles.slice(0, i + 1);
      const price = candles[i]!.close;

      if (open) {
        let exit: number | null = null;
        if (open.side === Side.BUY) {
          if (candles[i]!.low <= open.sl) exit = open.sl;
          else if (candles[i]!.high >= open.tp) exit = open.tp;
        } else {
          if (candles[i]!.high >= open.sl) exit = open.sl;
          else if (candles[i]!.low <= open.tp) exit = open.tp;
        }
        if (exit != null) {
          const dir = open.side === Side.BUY ? 1 : -1;
          const pnl =
            (exit - open.entry) * open.qty * dir - exit * open.qty * feeRate - open.entry * open.qty * feeRate;
          equity += pnl;
          trades.push({ pnl });
          peak = Math.max(peak, equity);
          maxDd = Math.max(maxDd, (peak - equity) / peak);
          open = null;
        }
      }

      if (!open) {
        const indicators = computeAllIndicators(window);
        const patterns = detectPatterns(window, indicators);
        const regimeResult = detectRegime(indicators);
        if (!isStrategyCompatibleWithRegime(params.strategyId, regimeResult.regime)) {
          equityCurve.push({ t: candles[i]!.openTime, equity });
          continue;
        }
        const result = strategy.evaluate({
          symbol: params.symbol,
          timeframe: params.interval,
          candles: window,
          indicators,
          patterns,
          params: params.strategyParams,
        });
        if (
          result.decision !== Decision.NO_TRADE &&
          result.entry &&
          result.stopLoss &&
          result.takeProfit
        ) {
          const risk = equity * 0.01;
          const slDist = Math.abs(result.entry - result.stopLoss);
          if (slDist > 0) {
            const qty = risk / slDist;
            open = {
              side: result.decision === Decision.BUY ? Side.BUY : Side.SELL,
              entry: price,
              sl: result.stopLoss,
              tp: result.takeProfit,
              qty,
              openIndex: i,
            };
            equity -= price * qty * feeRate;
          }
        }
      }

      equityCurve.push({ t: candles[i]!.openTime, equity });
    }

    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl < 0);
    const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

    const metrics: BacktestMetrics = {
      winRate: trades.length ? wins.length / trades.length : 0,
      lossRate: trades.length ? losses.length / trades.length : 0,
      profitFactor: grossLoss === 0 ? (grossProfit > 0 ? 999 : 0) : grossProfit / grossLoss,
      maxDrawdown: maxDd,
      averageProfit: wins.length ? grossProfit / wins.length : 0,
      averageLoss: losses.length ? grossLoss / losses.length : 0,
      totalTrades: trades.length,
      netProfit: equity - capital0,
    };

    run.set('metrics', metrics);
    run.set(
      'equityCurve',
      equityCurve.filter((_, i) => i % Math.ceil(equityCurve.length / 500 || 1) === 0),
    );
    run.status = 'completed';
    await run.save();
    return run;
  } catch (e) {
    run.status = 'failed';
    run.error = e instanceof Error ? e.message : String(e);
    await run.save();
    throw e;
  }
}

export async function listBacktests(userId: string) {
  return BacktestRun.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
}

export async function getBacktest(userId: string, id: string) {
  return BacktestRun.findOne({ _id: id, userId }).lean();
}
