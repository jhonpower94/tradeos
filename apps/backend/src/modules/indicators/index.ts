import type { Candle, IndicatorSnapshot } from '@trading-os/shared';

function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}
function highs(candles: Candle[]): number[] {
  return candles.map((c) => c.high);
}
function lows(candles: Candle[]): number[] {
  return candles.map((c) => c.low);
}
function volumes(candles: Candle[]): number[] {
  return candles.map((c) => c.volume);
}

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]!;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);
  const macdLine: (number | null)[] = values.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? fastE[i]! - slowE[i]! : null,
  );
  const macdNums = macdLine.map((v) => v ?? 0);
  const firstValid = macdLine.findIndex((v) => v != null);
  const signal: (number | null)[] = Array(values.length).fill(null);
  const histogram: (number | null)[] = Array(values.length).fill(null);
  if (firstValid >= 0) {
    const slice = macdNums.slice(firstValid);
    const sigSlice = ema(slice, signalPeriod);
    for (let i = 0; i < sigSlice.length; i++) {
      const idx = firstValid + i;
      signal[idx] = sigSlice[i];
      if (macdLine[idx] != null && sigSlice[i] != null) {
        histogram[idx] = macdLine[idx]! - sigSlice[i]!;
      }
    }
  }
  return { macd: macdLine, signal, histogram };
}

export function trueRange(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (i === 0) {
      out.push(c.high - c.low);
    } else {
      const prev = candles[i - 1]!.close;
      out.push(Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev)));
    }
  }
  return out;
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  return sma(trueRange(candles), period);
}

export function adx(
  candles: Candle[],
  period = 14,
): { adx: (number | null)[]; plusDI: (number | null)[]; minusDI: (number | null)[] } {
  const len = candles.length;
  const plusDM: number[] = Array(len).fill(0);
  const minusDM: number[] = Array(len).fill(0);
  const tr = trueRange(candles);
  for (let i = 1; i < len; i++) {
    const up = candles[i]!.high - candles[i - 1]!.high;
    const down = candles[i - 1]!.low - candles[i]!.low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const smooth = (arr: number[]) => {
    const out: (number | null)[] = Array(len).fill(null);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += arr[i]!;
    out[period - 1] = sum;
    for (let i = period; i < len; i++) {
      out[i] = out[i - 1]! - out[i - 1]! / period + arr[i]!;
    }
    return out;
  };
  const trs = smooth(tr);
  const pdm = smooth(plusDM);
  const mdm = smooth(minusDM);
  const plusDI: (number | null)[] = Array(len).fill(null);
  const minusDI: (number | null)[] = Array(len).fill(null);
  const dx: (number | null)[] = Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    if (trs[i] && trs[i]! > 0 && pdm[i] != null && mdm[i] != null) {
      plusDI[i] = (100 * pdm[i]!) / trs[i]!;
      minusDI[i] = (100 * mdm[i]!) / trs[i]!;
      const sum = plusDI[i]! + minusDI[i]!;
      dx[i] = sum === 0 ? 0 : (100 * Math.abs(plusDI[i]! - minusDI[i]!)) / sum;
    }
  }
  const adxLine = sma(
    dx.map((v) => v ?? 0),
    period,
  );
  return { adx: adxLine, plusDI, minusDI };
}

export function vwap(candles: Candle[]): (number | null)[] {
  const out: (number | null)[] = [];
  let cumTPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
    out.push(cumVol === 0 ? null : cumTPV / cumVol);
  }
  return out;
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = sma(values, period);
  const upper: (number | null)[] = Array(values.length).fill(null);
  const lower: (number | null)[] = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = values[j]! - middle[i]!;
      sum += d * d;
    }
    const std = Math.sqrt(sum / period);
    upper[i] = middle[i]! + mult * std;
    lower[i] = middle[i]! - mult * std;
  }
  return { upper, middle, lower };
}

export function stochasticRsi(
  values: number[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kPeriod = 3,
  dPeriod = 3,
): { k: (number | null)[]; d: (number | null)[] } {
  const r = rsi(values, rsiPeriod);
  const stoch: (number | null)[] = Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    if (r[i] == null) continue;
    const start = Math.max(0, i - stochPeriod + 1);
    let min = Infinity;
    let max = -Infinity;
    for (let j = start; j <= i; j++) {
      if (r[j] == null) continue;
      min = Math.min(min, r[j]!);
      max = Math.max(max, r[j]!);
    }
    stoch[i] = max === min ? 0 : ((r[i]! - min) / (max - min)) * 100;
  }
  const k = sma(
    stoch.map((v) => v ?? 0),
    kPeriod,
  );
  const d = sma(
    k.map((v) => v ?? 0),
    dPeriod,
  );
  return { k, d };
}

export function cci(candles: Candle[], period = 20): (number | null)[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const mid = sma(tp, period);
  const out: (number | null)[] = Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let mad = 0;
    for (let j = i - period + 1; j <= i; j++) mad += Math.abs(tp[j]! - mid[i]!);
    mad /= period;
    out[i] = mad === 0 ? 0 : (tp[i]! - mid[i]!) / (0.015 * mad);
  }
  return out;
}

export function roc(values: number[], period = 12): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  for (let i = period; i < values.length; i++) {
    out[i] = ((values[i]! - values[i - period]!) / values[i - period]!) * 100;
  }
  return out;
}

export function obv(candles: Candle[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      out.push(candles[i]!.volume);
      prev = candles[i]!.close;
      continue;
    }
    const c = candles[i]!.close;
    if (c > prev) out.push(out[i - 1]! + candles[i]!.volume);
    else if (c < prev) out.push(out[i - 1]! - candles[i]!.volume);
    else out.push(out[i - 1]!);
    prev = c;
  }
  return out;
}

export function mfi(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = Array(candles.length).fill(null);
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const raw = candles.map((c, i) => tp[i]! * c.volume);
  for (let i = period; i < candles.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j]! > tp[j - 1]!) pos += raw[j]!;
      else if (tp[j]! < tp[j - 1]!) neg += raw[j]!;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function donchian(
  candles: Candle[],
  period = 20,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = Array(candles.length).fill(null);
  const lower: (number | null)[] = Array(candles.length).fill(null);
  const middle: (number | null)[] = Array(candles.length).fill(null);
  const h = highs(candles);
  const l = lows(candles);
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, h[j]!);
      lo = Math.min(lo, l[j]!);
    }
    upper[i] = hi;
    lower[i] = lo;
    middle[i] = (hi + lo) / 2;
  }
  return { upper, middle, lower };
}

export function ichimoku(
  candles: Candle[],
  tenkanPeriod = 9,
  kijunPeriod = 26,
  senkouBPeriod = 52,
): {
  tenkan: (number | null)[];
  kijun: (number | null)[];
  senkouA: (number | null)[];
  senkouB: (number | null)[];
  chikou: (number | null)[];
} {
  const len = candles.length;
  const h = highs(candles);
  const l = lows(candles);
  const c = closes(candles);
  const midHighLow = (period: number, i: number) => {
    if (i < period - 1) return null;
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, h[j]!);
      lo = Math.min(lo, l[j]!);
    }
    return (hi + lo) / 2;
  };
  const tenkan: (number | null)[] = Array(len).fill(null);
  const kijun: (number | null)[] = Array(len).fill(null);
  const senkouA: (number | null)[] = Array(len).fill(null);
  const senkouB: (number | null)[] = Array(len).fill(null);
  const chikou: (number | null)[] = Array(len).fill(null);
  for (let i = 0; i < len; i++) {
    tenkan[i] = midHighLow(tenkanPeriod, i);
    kijun[i] = midHighLow(kijunPeriod, i);
    if (tenkan[i] != null && kijun[i] != null) {
      const a = (tenkan[i]! + kijun[i]!) / 2;
      const idx = i + kijunPeriod;
      if (idx < len) senkouA[idx] = a;
    }
    const b = midHighLow(senkouBPeriod, i);
    if (b != null) {
      const idx = i + kijunPeriod;
      if (idx < len) senkouB[idx] = b;
    }
    const chi = i - kijunPeriod;
    if (chi >= 0) chikou[chi] = c[i]!;
  }
  return { tenkan, kijun, senkouA, senkouB, chikou };
}

export function parabolicSar(
  candles: Candle[],
  step = 0.02,
  max = 0.2,
): (number | null)[] {
  const out: (number | null)[] = Array(candles.length).fill(null);
  if (candles.length < 2) return out;
  let bull = candles[1]!.close > candles[0]!.close;
  let af = step;
  let ep = bull ? candles[0]!.high : candles[0]!.low;
  let sar = bull ? candles[0]!.low : candles[0]!.high;
  out[0] = sar;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    sar = sar + af * (ep - sar);
    if (bull) {
      sar = Math.min(sar, candles[i - 1]!.low, i > 1 ? candles[i - 2]!.low : candles[i - 1]!.low);
      if (c.low < sar) {
        bull = false;
        sar = ep;
        ep = c.low;
        af = step;
      } else {
        if (c.high > ep) {
          ep = c.high;
          af = Math.min(max, af + step);
        }
      }
    } else {
      sar = Math.max(sar, candles[i - 1]!.high, i > 1 ? candles[i - 2]!.high : candles[i - 1]!.high);
      if (c.high > sar) {
        bull = true;
        sar = ep;
        ep = c.high;
        af = step;
      } else {
        if (c.low < ep) {
          ep = c.low;
          af = Math.min(max, af + step);
        }
      }
    }
    out[i] = sar;
  }
  return out;
}

export function supertrend(
  candles: Candle[],
  period = 10,
  mult = 3,
): { value: (number | null)[]; direction: (number | null)[] } {
  const atrLine = atr(candles, period);
  const value: (number | null)[] = Array(candles.length).fill(null);
  const direction: (number | null)[] = Array(candles.length).fill(null);
  let prevUpper = 0;
  let prevLower = 0;
  let prevDir = 1;
  let prevSt = 0;
  for (let i = 0; i < candles.length; i++) {
    if (atrLine[i] == null) continue;
    const mid = (candles[i]!.high + candles[i]!.low) / 2;
    let upper = mid + mult * atrLine[i]!;
    let lower = mid - mult * atrLine[i]!;
    if (i > 0 && atrLine[i - 1] != null) {
      lower = lower > prevLower || candles[i - 1]!.close < prevLower ? lower : prevLower;
      upper = upper < prevUpper || candles[i - 1]!.close > prevUpper ? upper : prevUpper;
    }
    let dir = prevDir;
    let st = prevSt;
    if (atrLine[i] != null && i > 0) {
      if (prevSt === prevUpper) dir = candles[i]!.close > upper ? 1 : -1;
      else dir = candles[i]!.close < lower ? -1 : 1;
      st = dir === 1 ? lower : upper;
    } else {
      dir = 1;
      st = lower;
    }
    value[i] = st;
    direction[i] = dir;
    prevUpper = upper;
    prevLower = lower;
    prevDir = dir;
    prevSt = st;
  }
  return { value, direction };
}

export function pivotPoints(candles: Candle[]): IndicatorSnapshot['pivots'] {
  if (candles.length < 2) return undefined;
  const prev = candles[candles.length - 2]!;
  const pivot = (prev.high + prev.low + prev.close) / 3;
  const r1 = 2 * pivot - prev.low;
  const s1 = 2 * pivot - prev.high;
  const r2 = pivot + (prev.high - prev.low);
  const s2 = pivot - (prev.high - prev.low);
  const r3 = prev.high + 2 * (pivot - prev.low);
  const s3 = prev.low - 2 * (prev.high - pivot);
  return { pivot, r1, r2, r3, s1, s2, s3 };
}

function compact(arr: (number | null)[]): number[] {
  return arr.map((v) => v ?? NaN);
}

/** Build full indicator snapshot for strategy/pattern consumption */
export function computeAllIndicators(candles: Candle[]): IndicatorSnapshot {
  const c = closes(candles);
  const vol = volumes(candles);
  const macdR = macd(c);
  const adxR = adx(candles);
  const bb = bollinger(c);
  const stoch = stochasticRsi(c);
  const st = supertrend(candles);
  const don = donchian(candles);
  const ich = ichimoku(candles);
  return {
    ema9: compact(ema(c, 9)),
    ema21: compact(ema(c, 21)),
    ema50: compact(ema(c, 50)),
    ema200: compact(ema(c, 200)),
    sma20: compact(sma(c, 20)),
    sma50: compact(sma(c, 50)),
    rsi14: compact(rsi(c, 14)),
    macd: {
      macd: compact(macdR.macd),
      signal: compact(macdR.signal),
      histogram: compact(macdR.histogram),
    },
    adx14: {
      adx: compact(adxR.adx),
      plusDI: compact(adxR.plusDI),
      minusDI: compact(adxR.minusDI),
    },
    atr14: compact(atr(candles, 14)),
    vwap: compact(vwap(candles)),
    supertrend: { value: compact(st.value), direction: compact(st.direction) },
    bollinger: {
      upper: compact(bb.upper),
      middle: compact(bb.middle),
      lower: compact(bb.lower),
    },
    stochRsi: { k: compact(stoch.k), d: compact(stoch.d) },
    cci20: compact(cci(candles, 20)),
    roc12: compact(roc(c, 12)),
    obv: obv(candles),
    mfi14: compact(mfi(candles, 14)),
    volume: vol,
    volumeMa20: compact(sma(vol, 20)),
    donchian: {
      upper: compact(don.upper),
      middle: compact(don.middle),
      lower: compact(don.lower),
    },
    ichimoku: {
      tenkan: compact(ich.tenkan),
      kijun: compact(ich.kijun),
      senkouA: compact(ich.senkouA),
      senkouB: compact(ich.senkouB),
      chikou: compact(ich.chikou),
    },
    parabolicSar: compact(parabolicSar(candles)),
    pivots: pivotPoints(candles),
  };
}

export function lastValid(arr: number[] | undefined): number | undefined {
  if (!arr) return undefined;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return undefined;
}

export const INDICATOR_MIN_PERIODS = 220;
