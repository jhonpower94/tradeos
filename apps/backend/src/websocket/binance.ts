import WebSocket from 'ws';
import { config } from '../config/index.js';
import { marketDataService, setTickerPrice } from '../modules/market-data/index.js';
import type { Candle } from '@trading-os/shared';

type MessageHandler = (msg: unknown) => void;

export class BinanceWsClient {
  private ws?: WebSocket;
  private streams = new Set<string>();
  private reconnectAttempt = 0;
  private closed = false;
  private handlers: MessageHandler[] = [];
  private pingTimer?: NodeJS.Timeout;

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  subscribe(streams: string[]) {
    for (const s of streams) this.streams.add(s.toLowerCase());
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: streams.map((s) => s.toLowerCase()), id: Date.now() }));
    } else {
      this.connect();
    }
  }

  unsubscribe(streams: string[]) {
    for (const s of streams) this.streams.delete(s.toLowerCase());
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({ method: 'UNSUBSCRIBE', params: streams.map((s) => s.toLowerCase()), id: Date.now() }),
      );
    }
  }

  connect() {
    if (this.closed) return;
    const list = [...this.streams];
    const path =
      list.length === 0
        ? '/ws/!miniTicker@arr'
        : list.length === 1
          ? `/ws/${list[0]}`
          : `/stream?streams=${list.join('/')}`;
    const url = `${config.binanceWsUrl}${path}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.reconnectAttempt = 0;
      this.pingTimer = setInterval(() => {
        this.ws?.ping();
      }, 60_000);
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data));
        const payload = msg.data ?? msg;
        this.handlePayload(payload);
        for (const h of this.handlers) h(payload);
      } catch {
        // ignore
      }
    });

    this.ws.on('close', () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.scheduleReconnect();
    });

    this.ws.on('error', () => {
      this.ws?.close();
    });
  }

  private handlePayload(payload: Record<string, unknown>) {
    if (Array.isArray(payload)) {
      for (const t of payload) {
        if (t.s && t.c) setTickerPrice(String(t.s), Number(t.c));
      }
      return;
    }
    if (payload.e === '24hrMiniTicker' && payload.s && payload.c) {
      setTickerPrice(String(payload.s), Number(payload.c));
    }
    if (payload.e === 'kline' && payload.k) {
      const k = payload.k as Record<string, unknown>;
      const candle: Candle = {
        openTime: Number(k.t),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
        volume: Number(k.v),
        closeTime: Number(k.T),
      };
      setTickerPrice(String(payload.s), candle.close);
      marketDataService.updateCandle(String(payload.s), String(k.i), candle);
    }
  }

  private scheduleReconnect() {
    if (this.closed) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt) + Math.random() * 500;
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), delay);
  }

  resubscribe() {
    const streams = [...this.streams];
    this.streams.clear();
    this.subscribe(streams);
  }

  close() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }
}

export const binanceWsClient = new BinanceWsClient();

export function startMarketStreams(symbols: string[] = ['btcusdt', 'ethusdt'], intervals: string[] = ['1m', '15m']) {
  const streams = ['!miniTicker@arr'];
  for (const s of symbols.slice(0, 20)) {
    for (const i of intervals) {
      streams.push(`${s.toLowerCase()}@kline_${i}`);
    }
  }
  binanceWsClient.subscribe(streams);
}
