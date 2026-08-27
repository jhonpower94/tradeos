import type { UTCTimestamp } from 'lightweight-charts';

export type RawCandle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type ChartBar = {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
};

export function candleChannelKey(symbol: string, interval: string): string {
  return `${symbol.toUpperCase()}:${interval}`;
}

export function candleWsChannel(symbol: string, interval: string): string {
  return `candles:${symbol.toUpperCase()}:${interval}`;
}

export function toChartBar(candle: RawCandle): ChartBar {
  return {
    time: Math.floor(candle.openTime / 1000) as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

export function toChartBars(candles: RawCandle[]): ChartBar[] {
  return candles.map(toChartBar);
}

export type CandleMergeAction =
  | { kind: 'initial' }
  | { kind: 'update'; bar: ChartBar }
  | { kind: 'noop' };

/** Decide how to apply a REST refresh without resetting the full series. */
export function mergeCandleTail(
  lastBarTime: number | null,
  candles: RawCandle[],
): CandleMergeAction {
  if (!candles.length) return { kind: 'noop' };
  if (lastBarTime == null) return { kind: 'initial' };

  const bars = toChartBars(candles);
  const last = bars[bars.length - 1]!;
  const prev = bars.length > 1 ? bars[bars.length - 2]! : null;

  if (last.time === lastBarTime) {
    return { kind: 'update', bar: last };
  }
  if (prev?.time === lastBarTime && last.time > lastBarTime) {
    return { kind: 'update', bar: last };
  }
  if (last.time > lastBarTime) {
    return { kind: 'update', bar: last };
  }
  return { kind: 'initial' };
}
