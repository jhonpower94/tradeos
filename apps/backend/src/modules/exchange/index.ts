import { createHmac } from 'node:crypto';
import type { Candle, Timeframe } from '@trading-os/shared';
import { LEVERAGED_TOKEN_DENYLIST } from '@trading-os/shared';
import { config } from '../../config/index.js';
import {
  WeightWindowLimiter,
  binanceDepthWeight,
  binanceKlinesWeight,
  parseBinanceBanUntilMs,
} from '../../utils/rate-limiter.js';
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

export type MarginSideEffect = 'NO_SIDE_EFFECT' | 'MARGIN_BUY' | 'AUTO_REPAY' | 'AUTO_BORROW_REPAY';

export interface PlaceMarginOrderParams extends PlaceOrderParams {
  /** Isolated margin only for this integration. */
  isIsolated?: boolean;
  sideEffectType?: MarginSideEffect;
}

export interface IsolatedMarginAssetBalance {
  asset: string;
  free: number;
  locked: number;
  borrowed: number;
  interest: number;
  netAsset: number;
}

export interface IsolatedMarginPairAccount {
  symbol: string;
  base: IsolatedMarginAssetBalance;
  quote: IsolatedMarginAssetBalance;
  marginLevel: number;
  liquidatePrice: number;
  liquidateRate: number;
  enabled: boolean;
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
  /** Stay under Binance IP REQUEST_WEIGHT (~6000/min) with headroom for UI/manual calls. */
  private limiter = new WeightWindowLimiter(config.binanceWeightLimitPerMin, 60_000);
  private restUrl: string;
  private credentials?: Credentials;
  private symbolCache: SymbolInfo[] | null = null;
  private symbolCacheAt = 0;
  private tickers24hrCache: { at: number; data: TickerPrice[] } | null = null;
  private banUntilMs = 0;

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

  private async waitIfBanned(): Promise<void> {
    const now = Date.now();
    if (this.banUntilMs <= now) return;
    const remaining = this.banUntilMs - now;
    if (remaining > 15_000) {
      throw new AppError(
        'BINANCE_BANNED',
        `Binance IP banned until ${new Date(this.banUntilMs).toISOString()}`,
        418,
        { banUntilMs: this.banUntilMs },
      );
    }
    await new Promise((r) => setTimeout(r, remaining + 250));
  }

  private async request<T>(
    method: string,
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    signed = false,
    weight = 1,
    attempt = 0,
  ): Promise<T> {
    await this.waitIfBanned();
    await this.limiter.acquire(weight);
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

    const usedHdr =
      res.headers.get('x-mbx-used-weight-1m') ?? res.headers.get('X-MBX-USED-WEIGHT-1M');
    if (usedHdr) {
      const used = Number(usedHdr);
      if (Number.isFinite(used)) this.limiter.syncUsedWeight(used);
    }

    if (!res.ok) {
      const body = await res.text();
      const banUntil = parseBinanceBanUntilMs(body);
      if (banUntil) this.banUntilMs = Math.max(this.banUntilMs, banUntil);

      if (res.status === 418 || /banned until/i.test(body)) {
        throw new AppError(
          'BINANCE_BANNED',
          `Binance IP banned${banUntil ? ` until ${new Date(banUntil).toISOString()}` : ''}: ${body}`,
          418,
          { banUntilMs: banUntil ?? this.banUntilMs, body },
        );
      }

      if (res.status === 429 && attempt < 1) {
        const retryAfterSec = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, 60_000)
          : banUntil
            ? Math.min(Math.max(banUntil - Date.now(), 5_000), 60_000)
            : 10_000;
        await new Promise((r) => setTimeout(r, waitMs));
        return this.request(method, path, params, signed, weight, attempt + 1);
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
    }>('GET', '/api/v3/exchangeInfo', {}, false, 20);
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
    const raw = await this.request<unknown[][]>(
      'GET',
      '/api/v3/klines',
      {
        symbol: symbol.toUpperCase(),
        interval,
        limit,
      },
      false,
      binanceKlinesWeight(limit),
    );
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
      const raw = await this.request<unknown[][]>(
        'GET',
        '/api/v3/klines',
        {
          symbol: symbol.toUpperCase(),
          interval,
          startTime: cursor,
          endTime,
          limit: 1000,
        },
        false,
        binanceKlinesWeight(1000),
      );
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
    }>('GET', '/api/v3/ticker/24hr', { symbol: symbol.toUpperCase() }, false, 1);
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
    const ttl = config.binanceTickersCacheMs;
    if (this.tickers24hrCache && Date.now() - this.tickers24hrCache.at < ttl) {
      return this.tickers24hrCache.data;
    }
    const data = await this.request<
      Array<{
        symbol: string;
        lastPrice: string;
        bidPrice: string;
        askPrice: string;
        quoteVolume: string;
        priceChangePercent: string;
      }>
    >('GET', '/api/v3/ticker/24hr', {}, false, 40);
    const mapped = data.map((t) => ({
      symbol: t.symbol,
      price: Number(t.lastPrice),
      bid: Number(t.bidPrice),
      ask: Number(t.askPrice),
      volume24h: Number(t.quoteVolume),
      priceChangePercent: Number(t.priceChangePercent),
    }));
    this.tickers24hrCache = { at: Date.now(), data: mapped };
    return mapped;
  }

  async getOrderBook(symbol: string, limit = 20): Promise<OrderBook> {
    const data = await this.request<{
      bids: string[][];
      asks: string[][];
    }>('GET', '/api/v3/depth', { symbol: symbol.toUpperCase(), limit }, false, binanceDepthWeight(limit));
    return {
      bids: data.bids.map((b) => [Number(b[0]), Number(b[1])]),
      asks: data.asks.map((a) => [Number(a[0]), Number(a[1])]),
    };
  }

  async getBalances(): Promise<Balance[]> {
    const data = await this.request<{
      balances: Array<{ asset: string; free: string; locked: string }>;
    }>('GET', '/api/v3/account', {}, true, 20);
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
    }>('POST', '/api/v3/order', body, true, 1);
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
    await this.request('DELETE', '/api/v3/order', { symbol, orderId }, true, 1);
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

  /** Enable isolated margin for a symbol if not already enabled. */
  async ensureIsolatedAccount(symbol: string): Promise<void> {
    const sym = symbol.toUpperCase();
    try {
      const acct = await this.getIsolatedMarginAccount(sym);
      if (acct.some((a) => a.symbol === sym && a.enabled)) return;
    } catch {
      // create below
    }
    const base = this.baseAsset(sym);
    try {
      await this.request('POST', '/sapi/v1/margin/isolated/create', { base, quote: 'USDT' }, true, 1);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already|exist/i.test(msg)) throw e;
    }
  }

  private baseAsset(symbol: string): string {
    const sym = symbol.toUpperCase();
    const cached = this.symbolCache?.find((s) => s.symbol === sym);
    if (cached?.baseAsset) return cached.baseAsset;
    if (sym.endsWith('USDT')) return sym.slice(0, -4);
    return sym;
  }

  async transferIsolatedMargin(input: {
    asset: string;
    symbol: string;
    amount: number;
    /** spot → isolated = 'to_isolated'; isolated → spot = 'to_spot' */
    direction: 'to_isolated' | 'to_spot';
  }): Promise<void> {
    await this.request(
      'POST',
      '/sapi/v1/margin/isolated/transfer',
      {
        asset: input.asset.toUpperCase(),
        symbol: input.symbol.toUpperCase(),
        transFrom: input.direction === 'to_isolated' ? 'SPOT' : 'ISOLATED_MARGIN',
        transTo: input.direction === 'to_isolated' ? 'ISOLATED_MARGIN' : 'SPOT',
        amount: input.amount,
      },
      true,
      1,
    );
  }

  async getIsolatedMarginAccount(symbol?: string): Promise<IsolatedMarginPairAccount[]> {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (symbol) params.symbols = symbol.toUpperCase();
    const data = await this.request<{
      assets: Array<{
        symbol: string;
        marginLevel: string;
        liquidatePrice: string;
        liquidateRate: string;
        enabled: boolean;
        baseAsset: {
          asset: string;
          free: string;
          locked: string;
          borrowed: string;
          interest: string;
          netAsset: string;
        };
        quoteAsset: {
          asset: string;
          free: string;
          locked: string;
          borrowed: string;
          interest: string;
          netAsset: string;
        };
      }>;
    }>('GET', '/sapi/v1/margin/isolated/account', params, true, 10);

    const mapAsset = (a: {
      asset: string;
      free: string;
      locked: string;
      borrowed: string;
      interest: string;
      netAsset: string;
    }): IsolatedMarginAssetBalance => ({
      asset: a.asset,
      free: Number(a.free),
      locked: Number(a.locked),
      borrowed: Number(a.borrowed),
      interest: Number(a.interest),
      netAsset: Number(a.netAsset),
    });

    return (data.assets ?? []).map((row) => ({
      symbol: row.symbol,
      base: mapAsset(row.baseAsset),
      quote: mapAsset(row.quoteAsset),
      marginLevel: Number(row.marginLevel),
      liquidatePrice: Number(row.liquidatePrice),
      liquidateRate: Number(row.liquidateRate),
      enabled: Boolean(row.enabled),
    }));
  }

  /** Spot USDT free + isolated USDT free across pairs (for sizing). */
  async getMarginSizingQuote(): Promise<{ spotFree: number; isolatedFree: number; freeQuote: number }> {
    const spot = await this.getBalances();
    const usdt = spot.find((b) => b.asset === 'USDT');
    const spotFree = usdt?.free ?? 0;
    let isolatedFree = 0;
    try {
      const pairs = await this.getIsolatedMarginAccount();
      for (const p of pairs) {
        if (p.quote.asset === 'USDT') isolatedFree += p.quote.free;
      }
    } catch {
      // margin account may be empty / disabled
    }
    return { spotFree, isolatedFree, freeQuote: spotFree + isolatedFree };
  }

  async placeMarginOrder(params: PlaceMarginOrderParams): Promise<OrderResult> {
    const body: Record<string, string | number | boolean | undefined> = {
      symbol: params.symbol.toUpperCase(),
      side: params.side,
      type: params.type,
      quantity: params.quantity,
      isIsolated: 'TRUE',
      sideEffectType: params.sideEffectType ?? 'NO_SIDE_EFFECT',
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
    }>('POST', '/sapi/v1/margin/order', body, true, 6);
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

}

export const exchangeService = new ExchangeService();
