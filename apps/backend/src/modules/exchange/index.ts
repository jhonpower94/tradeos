import { createHmac } from 'node:crypto';
import type { Candle, Timeframe } from '@trading-os/shared';
import { LEVERAGED_TOKEN_DENYLIST } from '@trading-os/shared';
import { config } from '../../config/index.js';
import { RateLimiter } from '../../utils/rate-limiter.js';
import { AppError } from '../../utils/errors.js';

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  filters: Record<string, unknown>[];
}

export interface TickerPrice {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  volume24h?: number;
  priceChangePercent?: number;
}

export interface OrderBook {
  bids: [number, number][];
  asks: [number, number][];
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
}

export interface PlaceOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: number;
  price?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  newClientOrderId?: string;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  status: string;
  side: string;
  type: string;
  price: number;
  executedQty: number;
  cummulativeQuoteQty: number;
}

type Credentials = { apiKey: string; apiSecret: string };

export class ExchangeService {
  private limiter = new RateLimiter(1100, 20);
  private restUrl: string;
  private credentials?: Credentials;
  private symbolCache: SymbolInfo[] | null = null;
  private symbolCacheAt = 0;

  constructor(restUrl = config.binanceRestUrl) {
    this.restUrl = restUrl.replace(/\/$/, '');
  }

  setCredentials(creds: Credentials | undefined) {
    this.credentials = creds;
  }

  setRestUrl(url: string) {
    this.restUrl = url.replace(/\/$/, '');
  }

  getRestUrl() {
    return this.restUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    signed = false,
  ): Promise<T> {
    await this.limiter.acquire(1);
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) search.set(k, String(v));
    }
    const headers: Record<string, string> = {};
    if (signed) {
      if (!this.credentials) throw new AppError('NO_KEYS', 'Binance API keys not configured', 400);
      search.set('timestamp', String(Date.now()));
      const sig = createHmac('sha256', this.credentials.apiSecret)
        .update(search.toString())
        .digest('hex');
      search.set('signature', sig);
      headers['X-MBX-APIKEY'] = this.credentials.apiKey;
    }
    const qs = search.toString();
    const url = `${this.restUrl}${path}${qs ? `?${qs}` : ''}`;
    let res: Response;
    try {
      res = await fetch(url, { method, headers });
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      const detail =
        err instanceof Error && 'cause' in err && err.cause instanceof Error
          ? err.cause.message
          : cause;
      throw new AppError(
        'BINANCE_UNREACHABLE',
        `Cannot reach Binance at ${this.restUrl} (${detail}). Check network/DNS, VPN, or BINANCE_REST_URL.`,
        503,
        { url: this.restUrl, detail },
      );
    }
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
        return this.request(method, path, params, signed);
      }
      const status = res.status >= 400 && res.status < 600 ? res.status : 502;
      throw new AppError('BINANCE_ERROR', `Binance ${res.status}: ${body}`, status);
    }
    return res.json() as Promise<T>;
  }

  async getExchangeInfo(): Promise<SymbolInfo[]> {
    if (this.symbolCache && Date.now() - this.symbolCacheAt < 60 * 60 * 1000) {
      return this.symbolCache;
    }
    const data = await this.request<{
      symbols: Array<{
        symbol: string;
        baseAsset: string;
        quoteAsset: string;
        status: string;
        filters: Record<string, unknown>[];
      }>;
    }>('GET', '/api/v3/exchangeInfo');
    this.symbolCache = data.symbols.map((s) => ({
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset,
      status: s.status,
      filters: s.filters,
    }));
    this.symbolCacheAt = Date.now();
    return this.symbolCache;
  }

  async getUsdtSymbols(): Promise<string[]> {
    const info = await this.getExchangeInfo();
    return info
      .filter(
        (s) =>
          s.quoteAsset === 'USDT' &&
          s.status === 'TRADING' &&
          !LEVERAGED_TOKEN_DENYLIST.some((d) => s.symbol.endsWith(d) || s.symbol.includes(d.replace('USDT', ''))),
      )
      .map((s) => s.symbol)
      .filter((s) => !/(UP|DOWN|BULL|BEAR)USDT$/.test(s));
  }

  async getCandles(symbol: string, interval: Timeframe | string, limit = 500): Promise<Candle[]> {
    const raw = await this.request<unknown[][]>('GET', '/api/v3/klines', {
      symbol: symbol.toUpperCase(),
      interval,
      limit,
    });
    return raw.map((k) => ({
      openTime: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
      closeTime: Number(k[6]),
    }));
  }

  async getCandlesRange(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number,
  ): Promise<Candle[]> {
    const all: Candle[] = [];
    let cursor = startTime;
    while (cursor < endTime) {
      const raw = await this.request<unknown[][]>('GET', '/api/v3/klines', {
        symbol: symbol.toUpperCase(),
        interval,
        startTime: cursor,
        endTime,
        limit: 1000,
      });
      if (!raw.length) break;
      for (const k of raw) {
        all.push({
          openTime: Number(k[0]),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5]),
          closeTime: Number(k[6]),
        });
      }
      cursor = Number(raw[raw.length - 1]![0]) + 1;
      if (raw.length < 1000) break;
    }
    return all;
  }

  async getTicker(symbol: string): Promise<TickerPrice> {
    const data = await this.request<{
      symbol: string;
      lastPrice: string;
      bidPrice: string;
      askPrice: string;
      quoteVolume: string;
      priceChangePercent: string;
    }>('GET', '/api/v3/ticker/24hr', { symbol: symbol.toUpperCase() });
    return {
      symbol: data.symbol,
      price: Number(data.lastPrice),
      bid: Number(data.bidPrice),
      ask: Number(data.askPrice),
      volume24h: Number(data.quoteVolume),
      priceChangePercent: Number(data.priceChangePercent),
    };
  }

  /** All USDT 24hr tickers (volume + bid/ask) for universe ranking/filtering. */
  async getAllTickers24hr(): Promise<TickerPrice[]> {
    const data = await this.request<
      Array<{
        symbol: string;
        lastPrice: string;
        bidPrice: string;
        askPrice: string;
        quoteVolume: string;
        priceChangePercent: string;
      }>
    >('GET', '/api/v3/ticker/24hr');
    return data.map((t) => ({
      symbol: t.symbol,
      price: Number(t.lastPrice),
      bid: Number(t.bidPrice),
      ask: Number(t.askPrice),
      volume24h: Number(t.quoteVolume),
      priceChangePercent: Number(t.priceChangePercent),
    }));
  }

  async getOrderBook(symbol: string, limit = 20): Promise<OrderBook> {
    const data = await this.request<{
      bids: string[][];
      asks: string[][];
    }>('GET', '/api/v3/depth', { symbol: symbol.toUpperCase(), limit });
    return {
      bids: data.bids.map((b) => [Number(b[0]), Number(b[1])]),
      asks: data.asks.map((a) => [Number(a[0]), Number(a[1])]),
    };
  }

  async getBalances(): Promise<Balance[]> {
    const data = await this.request<{
      balances: Array<{ asset: string; free: string; locked: string }>;
    }>('GET', '/api/v3/account', {}, true);
    return data.balances
      .map((b) => ({
        asset: b.asset,
        free: Number(b.free),
        locked: Number(b.locked),
      }))
      .filter((b) => b.free > 0 || b.locked > 0);
  }

  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    const body: Record<string, string | number | boolean | undefined> = {
      symbol: params.symbol.toUpperCase(),
      side: params.side,
      type: params.type,
      quantity: params.quantity,
    };
    if (params.type === 'LIMIT') {
      body.price = params.price;
      body.timeInForce = params.timeInForce ?? 'GTC';
    }
    if (params.newClientOrderId) body.newClientOrderId = params.newClientOrderId;
    const data = await this.request<{
      orderId: number;
      symbol: string;
      status: string;
      side: string;
      type: string;
      price: string;
      executedQty: string;
      cummulativeQuoteQty: string;
    }>('POST', '/api/v3/order', body, true);
    return {
      orderId: String(data.orderId),
      symbol: data.symbol,
      status: data.status,
      side: data.side,
      type: data.type,
      price: Number(data.price),
      executedQty: Number(data.executedQty),
      cummulativeQuoteQty: Number(data.cummulativeQuoteQty),
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<void> {
    await this.request('DELETE', '/api/v3/order', { symbol, orderId }, true);
  }

  getLotSize(symbol: string): { stepSize: number; minQty: number; minNotional: number } {
    const info = this.symbolCache?.find((s) => s.symbol === symbol);
    let stepSize = 0.00001;
    let minQty = 0.00001;
    let minNotional = 10;
    if (info) {
      for (const f of info.filters) {
        if (f.filterType === 'LOT_SIZE') {
          stepSize = Number(f.stepSize);
          minQty = Number(f.minQty);
        }
        if (f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL') {
          minNotional = Number(f.minNotional ?? f.notional ?? 10);
        }
      }
    }
    return { stepSize, minQty, minNotional };
  }

  roundQty(symbol: string, qty: number): number {
    const { stepSize, minQty } = this.getLotSize(symbol);
    const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
    const rounded = Math.floor(qty / stepSize) * stepSize;
    const fixed = Number(rounded.toFixed(precision));
    return Math.max(fixed, minQty === 0 ? fixed : 0);
  }
}

export const exchangeService = new ExchangeService();
