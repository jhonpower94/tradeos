import { binanceWsClient } from './binance.js';

const refs = new Map<string, number>();

export function candleChannel(symbol: string, interval: string): string {
  return `candles:${symbol.toUpperCase()}:${interval}`;
}

export function parseCandleChannel(channel: string): { symbol: string; interval: string } | null {
  if (!channel.startsWith('candles:')) return null;
  const parts = channel.split(':');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return null;
  return { symbol: parts[1].toUpperCase(), interval: parts[2] };
}

export function binanceKlineStream(symbol: string, interval: string): string {
  return `${symbol.toLowerCase()}@kline_${interval}`;
}

export function acquireCandleStream(symbol: string, interval: string): void {
  const stream = binanceKlineStream(symbol, interval);
  const count = refs.get(stream) ?? 0;
  if (count === 0) {
    binanceWsClient.subscribe([stream]);
  }
  refs.set(stream, count + 1);
}

export function releaseCandleStream(symbol: string, interval: string): void {
  const stream = binanceKlineStream(symbol, interval);
  const count = refs.get(stream) ?? 0;
  if (count <= 1) {
    refs.delete(stream);
    binanceWsClient.unsubscribe([stream]);
    return;
  }
  refs.set(stream, count - 1);
}

export function releaseCandleChannels(channels: Iterable<string>): void {
  for (const ch of channels) {
    const parsed = parseCandleChannel(ch);
    if (parsed) releaseCandleStream(parsed.symbol, parsed.interval);
  }
}

/** Test helper */
export function resetCandleStreamRefs(): void {
  refs.clear();
}

export function getCandleStreamRefCount(symbol: string, interval: string): number {
  return refs.get(binanceKlineStream(symbol, interval)) ?? 0;
}
