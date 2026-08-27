import { describe, expect, it } from 'vitest';
import {
  candleChannelKey,
  candleWsChannel,
  mergeCandleTail,
  toChartBar,
  toChartBars,
} from './candleChartUtils';

const sample = [
  { openTime: 1_700_000_000_000, open: 100, high: 101, low: 99, close: 100.5 },
  { openTime: 1_700_000_900_000, open: 100.5, high: 102, low: 100, close: 101 },
];

describe('candleChannelKey', () => {
  it('normalizes symbol case', () => {
    expect(candleChannelKey('btcusdt', '15m')).toBe('BTCUSDT:15m');
  });
});

describe('candleWsChannel', () => {
  it('builds ws channel', () => {
    expect(candleWsChannel('ethusdt', '1h')).toBe('candles:ETHUSDT:1h');
  });
});

describe('toChartBar', () => {
  it('converts ms openTime to seconds', () => {
    const bar = toChartBar(sample[0]!);
    expect(bar.time).toBe(1_700_000_000);
    expect(bar.close).toBe(100.5);
  });
});

describe('toChartBars', () => {
  it('maps all candles', () => {
    expect(toChartBars(sample)).toHaveLength(2);
  });
});

describe('mergeCandleTail', () => {
  it('returns initial when no last bar time', () => {
    expect(mergeCandleTail(null, sample)).toEqual({ kind: 'initial' });
  });

  it('updates same bar when time unchanged', () => {
    const bars = toChartBars(sample);
    const lastTime = bars[bars.length - 1]!.time;
    const action = mergeCandleTail(lastTime, sample);
    expect(action.kind).toBe('update');
    if (action.kind === 'update') {
      expect(action.bar.time).toBe(lastTime);
    }
  });

  it('updates when a new bar appears', () => {
    const bars = toChartBars(sample);
    const lastTime = bars[bars.length - 1]!.time;
    const next = [
      ...sample,
      { openTime: 1_700_001_800_000, open: 101, high: 103, low: 100.5, close: 102.5 },
    ];
    const action = mergeCandleTail(lastTime, next);
    expect(action.kind).toBe('update');
    if (action.kind === 'update') {
      expect(action.bar.time).toBeGreaterThan(lastTime);
    }
  });

  it('returns noop for empty candles', () => {
    expect(mergeCandleTail(100, [])).toEqual({ kind: 'noop' });
  });
});
