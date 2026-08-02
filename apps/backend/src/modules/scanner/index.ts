import { Position } from '../../models/Position.js';
import { MarketRegime, PositionStatus, filterStrategiesForRegime } from '@trading-os/shared';
import { gatewayBroadcast } from '../../websocket/gateway.js';
import { notify } from '../notifications/index.js';
import { NotificationType } from '@trading-os/shared';
import { processAutoSignals } from '../trade/index.js';
import { getRawSettings } from '../settings/index.js';
import { consensusToOpportunity, persistOpportunities } from '../ranking/index.js';
import {
  buildConsensus,
  detectHtfTrend,
  resolveParentTimeframe,
} from '../consensus/index.js';
import { runAllStrategies } from '../strategies/index.js';
import { detectPatterns } from '../patterns/index.js';
import { computeAllIndicators, INDICATOR_MIN_PERIODS } from '../indicators/index.js';
import { marketDataService, setTickerPrice } from '../market-data/index.js';
import { exchangeService } from '../exchange/index.js';
import { User } from '../../models/User.js';
import { detectRegime } from '../regime/index.js';
import type { Opportunity, Timeframe } from '@trading-os/shared';

export interface ScannerStatus {
  running: boolean;
  lastScanAt?: Date;
  pairsScanned: number;
  opportunitiesFound: number;
  errors: number;
  currentSymbol?: string;
}

class ScannerService {
  private running = false;
  private timer?: NodeJS.Timeout;
  private status: ScannerStatus = {
    running: false,
    pairsScanned: 0,
    opportunitiesFound: 0,
    errors: 0,
  };

  getStatus() {
    return { ...this.status, running: this.running };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.status.running = true;
    void this.loop();
  }

  stop() {
    this.running = false;
    this.status.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private async loop() {
    while (this.running) {
      try {
        await this.scanAllUsers();
      } catch (e) {
        this.status.errors++;
        console.error('Scanner loop error', e);
      }
      await new Promise((r) => {
        this.timer = setTimeout(r, 60_000);
      });
    }
  }

  async scanAllUsers() {
    const users = await User.find().select('_id').lean();
    for (const u of users) {
      await this.scanUser(String(u._id));
    }
  }

  async scanUser(userId: string) {
    const settings = await getRawSettings(userId);
    if (settings.scanner?.enabled === false) return;

    const timeframes = (settings.scanner?.timeframes ?? ['15m', '1h', '4h']) as Timeframe[];
    const deny = new Set(settings.scanner?.symbolsDenyList ?? []);
    const concurrency = settings.scanner?.concurrency ?? 5;
    const hotSize = settings.scanner?.hotSetSize ?? 50;
    const minLiquidity = settings.risk?.minLiquidityUsdt ?? 1_000_000;
    const maxSpreadBps = settings.risk?.maxSpreadBps ?? 20;

    let symbols = await exchangeService.getUsdtSymbols();
    symbols = symbols.filter((s) => !deny.has(s));
    const symbolSet = new Set(symbols);

    const openPos = await Position.find({ userId, status: PositionStatus.OPEN }).lean();
    const pinned = new Set(openPos.map((p) => p.symbol).filter((s) => symbolSet.has(s)));

    let tickers: Awaited<ReturnType<typeof exchangeService.getAllTickers24hr>> = [];
    try {
      tickers = await exchangeService.getAllTickers24hr();
    } catch {
      this.status.errors++;
      return;
    }

    const tickerBySymbol = new Map(tickers.map((t) => [t.symbol, t]));
    const liquidCandidates = symbols
      .filter((s) => !pinned.has(s))
      .map((s) => {
        const t = tickerBySymbol.get(s);
        if (!t || t.volume24h == null || t.bid == null || t.ask == null || !t.price) {
          return null;
        }
        const spreadBps = ((t.ask - t.bid) / t.price) * 10_000;
        if (t.volume24h < minLiquidity || spreadBps > maxSpreadBps) return null;
        return { symbol: s, volume24h: t.volume24h };
      })
      .filter((x): x is { symbol: string; volume24h: number } => x != null)
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, hotSize)
      .map((x) => x.symbol);

    const ordered = [...pinned, ...liquidCandidates.filter((s) => !pinned.has(s))];

    const opportunities: Opportunity[] = [];
    let scanned = 0;

    const queue = [...ordered];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const symbol = queue.shift();
        if (!symbol) break;
        this.status.currentSymbol = symbol;
        for (const tf of timeframes) {
          try {
            const opp = await this.analyze(userId, symbol, tf, settings);
            if (opp) opportunities.push(opp);
          } catch {
            this.status.errors++;
          }
        }
        scanned++;
      }
    });
    await Promise.all(workers);

    const ranked = await persistOpportunities(userId, opportunities);
    this.status.lastScanAt = new Date();
    this.status.pairsScanned = scanned;
    this.status.opportunitiesFound = ranked.length;

    gatewayBroadcast(userId, 'opportunities', ranked);
    gatewayBroadcast(userId, 'scanner.status', this.getStatus());

    if (ranked.length) {
      await notify(userId, NotificationType.TRADE_SIGNAL, {
        title: 'New opportunities',
        body: `${ranked.length} ranked opportunities`,
        payload: { count: ranked.length, top: ranked[0] },
      });
      await processAutoSignals(userId, ranked);
    }
  }

  async analyze(
    userId: string,
    symbol: string,
    timeframe: Timeframe,
    settings: Awaited<ReturnType<typeof getRawSettings>>,
  ): Promise<Opportunity | null> {
    void userId;
    const candles = await marketDataService.getCandles(
      symbol,
      timeframe,
      Math.max(INDICATOR_MIN_PERIODS, 250),
    );
    if (candles.length < 50) return null;
    setTickerPrice(symbol, candles[candles.length - 1]!.close);

    const indicators = computeAllIndicators(candles);
    const patterns = detectPatterns(candles, indicators);

    const stratObj: Record<string, { enabled: boolean; params?: Record<string, unknown> }> = {};
    if (settings.strategies) {
      if (typeof (settings.strategies as Map<string, unknown>).entries === 'function') {
        for (const [k, v] of (
          settings.strategies as Map<
            string,
            { enabled: boolean; params?: Record<string, unknown> }
          >
        ).entries()) {
          stratObj[k] = v;
        }
      } else {
        Object.assign(stratObj, settings.strategies);
      }
    }

    const regimeGating = settings.regime?.enabled !== false;
    const regimeResult = detectRegime(indicators);

    if (regimeGating && regimeResult.regime === MarketRegime.UNKNOWN) {
      return null;
    }

    const filteredMap = regimeGating
      ? filterStrategiesForRegime(stratObj, regimeResult.regime)
      : stratObj;

    if (regimeGating) {
      const anyEnabled = Object.values(filteredMap).some((s) => s.enabled);
      if (!anyEnabled) return null;
    }

    const strategyResults = runAllStrategies(
      { symbol, timeframe, candles, indicators, patterns },
      filteredMap,
    );

    let htfTrend: 'bull' | 'bear' | null = null;
    const htfVetoEnabled = settings.scanner?.htfVetoEnabled !== false;
    if (htfVetoEnabled) {
      const parentTf = resolveParentTimeframe(timeframe);
      if (parentTf) {
        try {
          const htfCandles = await marketDataService.getCandles(
            symbol,
            parentTf,
            Math.max(INDICATOR_MIN_PERIODS, 250),
          );
          if (htfCandles.length >= 50) {
            htfTrend = detectHtfTrend(computeAllIndicators(htfCandles));
          }
        } catch {
          htfTrend = null;
        }
      }
    }

    const minConf = settings.scanner?.minConfidence ?? 75;
    const consensus = buildConsensus({
      strategies: strategyResults,
      patterns,
      indicators,
      regimeResult,
      minAlignedStrategies: settings.scanner?.minAlignedStrategies ?? 2,
      minAgreementRatio: settings.scanner?.minAgreementRatio ?? 0.6,
      htfTrend,
      htfVetoEnabled,
    });
    if (consensus.score < minConf) return null;
    return consensusToOpportunity(symbol, timeframe, consensus, minConf);
  }
}

export const scannerService = new ScannerService();
