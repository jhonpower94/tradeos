import type { Candle, Timeframe } from '@trading-os/shared';
import { CandleModel } from '../../models/Candle.js';
import { exchangeService } from '../exchange/index.js';

const memoryCache = new Map<string, { candles: Candle[]; at: number }>();

/** Soft TTL: WS updates refresh `at`; used as a secondary freshness signal. */
const MEMORY_TTL_MS = 5 * 60_000;

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

export function intervalToMs(interval: string): number {
  return INTERVAL_MS[interval] ?? 60_000;
}

function cacheKey(symbol: string, interval: string) {
  return `${symbol.toUpperCase()}:${interval}`;
}

function toCandle(d: {
  openTime: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  closeTime?: number | null;
}): Candle | null {
  if (
    d.open == null ||
    d.high == null ||
    d.low == null ||
    d.close == null ||
    d.volume == null ||
    d.closeTime == null
  ) {
    return null;
  }
  return {
    openTime: d.openTime,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
    closeTime: d.closeTime,
  };
}

/**
 * True when the series includes the current (or previous) bar for `interval`.
 * Allows one missed bar so WS lag / brief gaps don't force a REST refill.
 */
export function isCandleSeriesFresh(
  candles: Candle[],
  interval: string,
  now = Date.now(),
): boolean {
  if (!candles.length) return false;
  const ms = intervalToMs(interval);
  const expectedOpen = Math.floor(now / ms) * ms;
  const lastOpen = candles[candles.length - 1]!.openTime;
  return lastOpen >= expectedOpen - ms;
}

async function persistCandles(symbol: string, interval: string, candles: Candle[]) {
  if (!candles.length) return;
  const sym = symbol.toUpperCase();
  const ops = candles.map((c) => ({
    updateOne: {
      filter: { symbol: sym, interval, openTime: c.openTime },
      update: { $set: { ...c, symbol: sym, interval } },
      upsert: true,
    },
  }));
  await CandleModel.bulkWrite(ops, { ordered: false }).catch(() => undefined);
}

export class MarketDataService {
  clearMemoryCache() {
    memoryCache.clear();
  }

  async getCandles(symbol: string, interval: Timeframe | string, limit = 500): Promise<Candle[]> {
    const sym = symbol.toUpperCase();
    const key = cacheKey(sym, interval);
    const now = Date.now();

    const mem = memoryCache.get(key);
    if (
      mem &&
      mem.candles.length >= limit &&
      (isCandleSeriesFresh(mem.candles, interval, now) || now - mem.at < MEMORY_TTL_MS)
    ) {
      return mem.candles.slice(-limit);
    }

    const fromDb = await this.getCandlesFromDb(sym, interval, limit);
    if (fromDb.length >= limit && isCandleSeriesFresh(fromDb, interval, now)) {
      memoryCache.set(key, { candles: fromDb, at: now });
      return fromDb.slice(-limit);
    }

    try {
      const candles = await exchangeService.getCandles(sym, interval, limit);
      void persistCandles(sym, interval, candles);
      memoryCache.set(key, { candles, at: Date.now() });
      return candles;
    } catch (err) {
      // Prefer any cached history over a failed chart when Binance is banned/throttled.
      if (mem && mem.candles.length) return mem.candles.slice(-limit);
      if (fromDb.length) {
        memoryCache.set(key, { candles: fromDb, at: now });
        return fromDb.slice(-limit);
      }
      throw err;
    }
  }

  async getCandlesFromDb(symbol: string, interval: string, limit = 500): Promise<Candle[]> {
    const docs = await CandleModel.find({ symbol: symbol.toUpperCase(), interval })
      .sort({ openTime: -1 })
      .limit(limit)
      .lean();
    return docs
      .reverse()
      .map((d) => toCandle(d))
      .filter((c): c is Candle => c != null);
  }

  updateCandle(
    symbol: string,
    interval: string,
    candle: Candle,
    opts?: { persist?: boolean },
  ) {
    const sym = symbol.toUpperCase();
    const key = cacheKey(sym, interval);
    const hit = memoryCache.get(key);
    if (!hit) {
      memoryCache.set(key, { candles: [candle], at: Date.now() });
    } else {
      const last = hit.candles[hit.candles.length - 1];
      if (last && last.openTime === candle.openTime) {
        hit.candles[hit.candles.length - 1] = candle;
      } else if (!last || candle.openTime > last.openTime) {
        hit.candles.push(candle);
        if (hit.candles.length > 1500) hit.candles.shift();
      }
      hit.at = Date.now();
    }

    if (opts?.persist) {
      void persistCandles(sym, interval, [candle]);
    }
  }

  getTickerCache(): Map<string, number> {
    return tickerPrices;
  }
}

const tickerPrices = new Map<string, number>();

export function setTickerPrice(symbol: string, price: number) {
  tickerPrices.set(symbol.toUpperCase(), price);
}

export function getTickerPrice(symbol: string): number | undefined {
  return tickerPrices.get(symbol.toUpperCase());
}

export const marketDataService = new MarketDataService();
