import type { Candle, Timeframe } from '@trading-os/shared';
import { CandleModel } from '../../models/Candle.js';
import { exchangeService } from '../exchange/index.js';
import { config } from '../../config/index.js';

const memoryCache = new Map<string, { candles: Candle[]; at: number }>();
const TTL_MS = 30_000;

function cacheKey(symbol: string, interval: string) {
  return `${symbol}:${interval}`;
}

export class MarketDataService {
  async getCandles(symbol: string, interval: Timeframe | string, limit = 500): Promise<Candle[]> {
    const key = cacheKey(symbol, interval);
    const hit = memoryCache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS && hit.candles.length >= limit) {
      return hit.candles.slice(-limit);
    }

    let candles = await exchangeService.getCandles(symbol, interval, limit);

    try {
      if (candles.length) {
        const ops = candles.map((c) => ({
          updateOne: {
            filter: { symbol, interval, openTime: c.openTime },
            update: { $set: { ...c, symbol, interval } },
            upsert: true,
          },
        }));
        await CandleModel.bulkWrite(ops, { ordered: false }).catch(() => undefined);
      }
    } catch {
      // persistence optional
    }

    memoryCache.set(key, { candles, at: Date.now() });
    return candles;
  }

  async getCandlesFromDb(symbol: string, interval: string, limit = 500): Promise<Candle[]> {
    const docs = await CandleModel.find({ symbol, interval })
      .sort({ openTime: -1 })
      .limit(limit)
      .lean();
    return docs
      .reverse()
      .map((d) => ({
        openTime: d.openTime,
        open: d.open!,
        high: d.high!,
        low: d.low!,
        close: d.close!,
        volume: d.volume!,
        closeTime: d.closeTime!,
      }));
  }

  updateCandle(symbol: string, interval: string, candle: Candle) {
    const key = cacheKey(symbol, interval);
    const hit = memoryCache.get(key);
    if (!hit) {
      memoryCache.set(key, { candles: [candle], at: Date.now() });
      return;
    }
    const last = hit.candles[hit.candles.length - 1];
    if (last && last.openTime === candle.openTime) {
      hit.candles[hit.candles.length - 1] = candle;
    } else if (!last || candle.openTime > last.openTime) {
      hit.candles.push(candle);
      if (hit.candles.length > 1500) hit.candles.shift();
    }
    hit.at = Date.now();
  }

  getTickerCache(): Map<string, number> {
    return tickerPrices;
  }
}

const tickerPrices = new Map<string, number>();

export function setTickerPrice(symbol: string, price: number) {
  tickerPrices.set(symbol, price);
}

export function getTickerPrice(symbol: string): number | undefined {
  return tickerPrices.get(symbol);
}

export const marketDataService = new MarketDataService();

void config;
