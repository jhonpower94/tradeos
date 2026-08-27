import { describe, expect, it, vi, beforeEach } from 'vitest';

const { subscribe, unsubscribe } = vi.hoisted(() => ({
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../src/websocket/binance.js', () => ({
  binanceWsClient: { subscribe, unsubscribe },
}));

import {
  acquireCandleStream,
  candleChannel,
  getCandleStreamRefCount,
  parseCandleChannel,
  releaseCandleStream,
  resetCandleStreamRefs,
} from '../src/websocket/candle-streams.js';

describe('candleChannel', () => {
  it('formats channel name', () => {
    expect(candleChannel('btcusdt', '15m')).toBe('candles:BTCUSDT:15m');
  });
});

describe('parseCandleChannel', () => {
  it('parses valid channel', () => {
    expect(parseCandleChannel('candles:ETHUSDT:1h')).toEqual({
      symbol: 'ETHUSDT',
      interval: '1h',
    });
  });

  it('returns null for non-candle channels', () => {
    expect(parseCandleChannel('opportunities')).toBeNull();
    expect(parseCandleChannel('candles:BTCUSDT')).toBeNull();
  });
});

describe('acquireCandleStream / releaseCandleStream', () => {
  beforeEach(() => {
    resetCandleStreamRefs();
    subscribe.mockClear();
    unsubscribe.mockClear();
  });

  it('subscribes on first acquire', () => {
    acquireCandleStream('BTCUSDT', '15m');
    expect(subscribe).toHaveBeenCalledWith(['btcusdt@kline_15m']);
    expect(getCandleStreamRefCount('BTCUSDT', '15m')).toBe(1);
  });

  it('increments ref count without duplicate subscribe', () => {
    acquireCandleStream('BTCUSDT', '15m');
    acquireCandleStream('BTCUSDT', '15m');
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(getCandleStreamRefCount('BTCUSDT', '15m')).toBe(2);
  });

  it('unsubscribes when last ref released', () => {
    acquireCandleStream('BTCUSDT', '15m');
    releaseCandleStream('BTCUSDT', '15m');
    expect(unsubscribe).toHaveBeenCalledWith(['btcusdt@kline_15m']);
    expect(getCandleStreamRefCount('BTCUSDT', '15m')).toBe(0);
  });

  it('keeps stream when refs remain', () => {
    acquireCandleStream('BTCUSDT', '15m');
    acquireCandleStream('BTCUSDT', '15m');
    releaseCandleStream('BTCUSDT', '15m');
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(getCandleStreamRefCount('BTCUSDT', '15m')).toBe(1);
  });
});
