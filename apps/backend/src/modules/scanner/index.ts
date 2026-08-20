import { Position } from '../../models/Position.js';
import { MarketRegime, PositionStatus, Timeframe, filterStrategiesForRegime } from '@trading-os/shared';
import { gatewayBroadcast } from '../../websocket/gateway.js';
import { notify } from '../notifications/index.js';
import { NotificationType } from '@trading-os/shared';
import { processAutoSignals } from '../trade/index.js';
import { getRawSettings } from '../settings/index.js';
import { consensusToOpportunity, isWatching, listOpportunities, persistOpportunities, persistSymbolOpportunities } from '../ranking/index.js';
import {
  buildConsensus,
  detectHtfTrend,
  resolveParentTimeframe,
} from '../consensus/index.js';
import { runAllStrategies, rescaleStrategyRiskReward } from '../strategies/index.js';
import { detectPatterns } from '../patterns/index.js';
import { computeAllIndicators, INDICATOR_MIN_PERIODS, lastValid } from '../indicators/index.js';
import { marketDataService, setTickerPrice } from '../market-data/index.js';
import { exchangeService } from '../exchange/index.js';
import { User } from '../../models/User.js';
import { detectRegime } from '../regime/index.js';
import type { Opportunity } from '@trading-os/shared';
import {
  buildWatchingOpportunity,
  computeRelativeStrength,
  findNearbyLocations,
  locationEvidence,
  previousDayLevels,
  relativeStrengthAligned,
  watchingSide,
} from '../location/index.js';

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
  /** In-flight post-close / targeted rescans keyed by userId:symbol. */
  private symbolScanInFlight = new Map<string, Promise<void>>();

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

    const openPos = await Position.find({ userId, status: PositionStatus.OPEN })
      .select('symbol')
      .lean();
    const held = new Set(openPos.map((p) => p.symbol));

    let tickers: Awaited<ReturnType<typeof exchangeService.getAllTickers24hr>> = [];
    try {
      tickers = await exchangeService.getAllTickers24hr();
    } catch {
      this.status.errors++;
      return;
    }

    const tickerBySymbol = new Map(tickers.map((t) => [t.symbol, t]));
    const btcTicker = tickerBySymbol.get('BTCUSDT') ?? tickerBySymbol.get('BTCUSDC');
    const rsEnabled = settings.scanner?.btcRelativeStrengthEnabled !== false;
    const locationGate = settings.scanner?.locationGateEnabled !== false;
    const pdhCache = new Map<string, { high: number; low: number } | null>();

    const loadPdhPdl = async (symbol: string) => {
      if (!locationGate) return null;
      if (pdhCache.has(symbol)) return pdhCache.get(symbol) ?? null;
      try {
        const daily = await marketDataService.getCandles(symbol, Timeframe.D1, 3);
        const levels = previousDayLevels(daily);
        pdhCache.set(symbol, levels);
        return levels;
      } catch {
        pdhCache.set(symbol, null);
        return null;
      }
    };

    const ordered = symbols
      .filter((s) => !held.has(s))
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
            const rs = rsEnabled
              ? computeRelativeStrength(
                  tickerBySymbol.get(symbol)?.priceChangePercent,
                  btcTicker?.priceChangePercent,
                )
              : undefined;
            const opp = await this.analyze(userId, symbol, tf, settings, {
              relativeStrength: rs,
              pdhPdl: await loadPdhPdl(symbol),
            });
            if (opp) opportunities.push(opp);
          } catch {
            this.status.errors++;
          }
        }
        scanned++;
      }
    });
    await Promise.all(workers);

    const items = await persistOpportunities(userId, opportunities);
    this.status.lastScanAt = new Date();
    this.status.pairsScanned = scanned;
    this.status.opportunitiesFound = items.length;

    gatewayBroadcast(userId, 'opportunities', items);
    gatewayBroadcast(userId, 'scanner.status', this.getStatus());

    if (items.length) {
      const triggered = items.filter((o) => !isWatching(o));
      const byRank = [...triggered].sort(
        (a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY),
      );
      if (triggered.length) {
        await notify(userId, NotificationType.TRADE_SIGNAL, {
          title: 'New opportunities',
          body: `${triggered.length} triggered · ${items.length - triggered.length} watching`,
          payload: { count: triggered.length, top: byRank[0] },
        });
        await processAutoSignals(userId, byRank);
      }
    }
  }

  /**
   * Re-analyze one freed symbol immediately (e.g. after position close) without
   * waiting for the full hot-set poll. Coalesces overlapping kicks per user+symbol.
   */
  async scanUserSymbol(userId: string, symbol: string): Promise<void> {
    const key = `${userId}:${symbol}`;
    const existing = this.symbolScanInFlight.get(key);
    if (existing) return existing;

    const run = this.runScanUserSymbol(userId, symbol).finally(() => {
      this.symbolScanInFlight.delete(key);
    });
    this.symbolScanInFlight.set(key, run);
    return run;
  }

  private async runScanUserSymbol(userId: string, symbol: string): Promise<void> {
    const settings = await getRawSettings(userId);
    if (settings.scanner?.enabled === false) return;

    const deny = new Set(settings.scanner?.symbolsDenyList ?? []);
    if (deny.has(symbol)) return;

    const stillOpen = await Position.exists({
      userId,
      symbol,
      status: PositionStatus.OPEN,
    });
    if (stillOpen) return;

    const timeframes = (settings.scanner?.timeframes ?? ['15m', '1h', '4h']) as Timeframe[];
    const rsEnabled = settings.scanner?.btcRelativeStrengthEnabled !== false;
    const locationGate = settings.scanner?.locationGateEnabled !== false;

    let relativeStrength: number | undefined;
    if (rsEnabled) {
      try {
        const tickers = await exchangeService.getAllTickers24hr();
        const tickerBySymbol = new Map(tickers.map((t) => [t.symbol, t]));
        const btcTicker = tickerBySymbol.get('BTCUSDT') ?? tickerBySymbol.get('BTCUSDC');
        relativeStrength = computeRelativeStrength(
          tickerBySymbol.get(symbol)?.priceChangePercent,
          btcTicker?.priceChangePercent,
        );
      } catch {
        relativeStrength = undefined;
      }
    }

    let pdhPdl: { high: number; low: number } | null = null;
    if (locationGate) {
      try {
        const daily = await marketDataService.getCandles(symbol, Timeframe.D1, 3);
        pdhPdl = previousDayLevels(daily);
      } catch {
        pdhPdl = null;
      }
    }

    const opportunities: Opportunity[] = [];
    for (const tf of timeframes) {
      try {
        this.status.currentSymbol = symbol;
        const opp = await this.analyze(userId, symbol, tf, settings, {
          relativeStrength,
          pdhPdl,
        });
        if (opp) opportunities.push(opp);
      } catch {
        this.status.errors++;
      }
    }

    const items = await persistSymbolOpportunities(userId, symbol, opportunities);
    // Full active list so live WS clients are not wiped down to this symbol only.
    const allActive = await listOpportunities(userId);
    gatewayBroadcast(userId, 'opportunities', allActive);
    gatewayBroadcast(userId, 'scanner.status', this.getStatus());

    if (items.length) {
      const triggered = items.filter((o) => !isWatching(o));
      const byRank = [...triggered].sort(
        (a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY),
      );
      if (triggered.length) {
        await notify(userId, NotificationType.TRADE_SIGNAL, {
          title: 'New opportunities',
          body: `${triggered.length} triggered · ${items.length - triggered.length} watching`,
          payload: { count: triggered.length, top: byRank[0] },
        });
        await processAutoSignals(userId, byRank);
      }
    }
  }

  async analyze(
    userId: string,
    symbol: string,
    timeframe: Timeframe,
    settings: Awaited<ReturnType<typeof getRawSettings>>,
    ctx: {
      relativeStrength?: number;
      pdhPdl?: { high: number; low: number } | null;
    } = {},
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
    const last = candles[candles.length - 1]!;
    const atr = lastValid(indicators.atr14) ?? 0;
    const locationGate = settings.scanner?.locationGateEnabled !== false;
    const proximityAtr = settings.scanner?.locationProximityAtr ?? 1.5;
    const nearby = atr > 0
      ? findNearbyLocations({
          close: last.close,
          atr,
          proximityAtr,
          indicators,
          patterns,
          pdhPdl: ctx.pdhPdl,
        })
      : [];

    if (locationGate && nearby.length === 0) return null;

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

    const minRR = settings.risk?.minRiskReward ?? 2;
    const strategyResults = runAllStrategies(
      { symbol, timeframe, candles, indicators, patterns },
      filteredMap,
    ).map((r) => rescaleStrategyRiskReward(r, minRR));

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

    const rs = ctx.relativeStrength;

    const triggered = consensusToOpportunity(symbol, timeframe, consensus, minConf);
    if (triggered) {
      if (!relativeStrengthAligned(triggered.side, rs)) return null;
      return {
        ...triggered,
        locations: nearby,
        relativeStrength: rs,
        stage: 'triggered',
        evidence: [...triggered.evidence, ...locationEvidence(nearby)],
      };
    }

    if (!locationGate || nearby.length === 0) return null;
    const side = watchingSide(htfTrend, nearby);
    if (!side || !relativeStrengthAligned(side, rs)) return null;
    return buildWatchingOpportunity({
      symbol,
      timeframe,
      side,
      nearby,
      atr,
      minRR,
      minConfidence: minConf,
      regime: regimeResult.regime,
      relativeStrength: rs,
    });
  }
}

export const scannerService = new ScannerService();
