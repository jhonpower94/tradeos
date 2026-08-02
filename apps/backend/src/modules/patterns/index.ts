import type { Candle, IndicatorSnapshot, PatternHit, PatternType } from '@trading-os/shared';
import { lastValid } from '../indicators/index.js';

export type SwingType = 'high' | 'low';

export interface SwingPoint {
  index: number;
  price: number;
  type: SwingType;
}

/**
 * Detect local swing highs/lows: a candle whose high (low) is strictly greater
 * (less) than every candle within `lookback` bars on both sides.
 */
export function findSwingPoints(candles: Candle[], lookback = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  const n = candles.length;
  for (let i = lookback; i < n - lookback; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      const o = candles[j]!;
      if (o.high >= c.high) isHigh = false;
      if (o.low <= c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) points.push({ index: i, price: c.high, type: 'high' });
    if (isLow) points.push({ index: i, price: c.low, type: 'low' });
  }
  return points;
}

function pctDiff(a: number, b: number): number {
  const avg = (a + b) / 2;
  if (avg === 0) return 0;
  return Math.abs(a - b) / avg;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function linRegSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i]! - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function avgBody(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  return candles.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / candles.length;
}

function relAtr(indicators: IndicatorSnapshot, price: number): number {
  const atr = lastValid(indicators.atr14);
  if (atr != null && atr > 0 && price > 0) return atr / price;
  return 0.01;
}

// ---------------------------------------------------------------------------
// Support / Resistance — cluster swing points into levels with >=2 touches
// ---------------------------------------------------------------------------
function detectSupportResistance(
  candles: Candle[],
  swings: SwingPoint[],
  indicators: IndicatorSnapshot,
): PatternHit[] {
  const hits: PatternHit[] = [];
  const lastPrice = candles[candles.length - 1]!.close;
  const tolerance = clamp(relAtr(indicators, lastPrice) * 0.8, 0.003, 0.02);

  const clusterAndEmit = (points: SwingPoint[], type: PatternType, bullish: boolean) => {
    const sorted = [...points].sort((a, b) => a.price - b.price);
    const clusters: SwingPoint[][] = [];
    for (const p of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && pctDiff(last[last.length - 1]!.price, p.price) <= tolerance) {
        last.push(p);
      } else {
        clusters.push([p]);
      }
    }
    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      const avgPrice = cluster.reduce((s, p) => s + p.price, 0) / cluster.length;
      const touches = cluster.length;
      const recentIndex = Math.max(...cluster.map((p) => p.index));
      const distancePct = pctDiff(avgPrice, lastPrice);
      if (distancePct > 0.06) continue;
      const confidence = clamp(40 + touches * 12 - distancePct * 300, 0, 95);
      hits.push({
        type,
        bullish,
        confidence: Math.round(confidence),
        price: avgPrice,
        index: recentIndex,
        meta: { touches, distancePct: Math.round(distancePct * 10000) / 10000 },
      });
    }
  };

  clusterAndEmit(
    swings.filter((s) => s.type === 'low'),
    'support',
    true,
  );
  clusterAndEmit(
    swings.filter((s) => s.type === 'high'),
    'resistance',
    false,
  );
  return hits;
}

// ---------------------------------------------------------------------------
// Double top / bottom
// ---------------------------------------------------------------------------
function detectDoubleTopBottom(candles: Candle[], swings: SwingPoint[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const highs = swings.filter((s) => s.type === 'high').sort((a, b) => a.index - b.index);
  const lows = swings.filter((s) => s.type === 'low').sort((a, b) => a.index - b.index);
  const tolerance = 0.015;

  for (let i = 0; i < highs.length - 1; i++) {
    const a = highs[i]!;
    const b = highs[i + 1]!;
    if (b.index - a.index < 4) continue;
    if (pctDiff(a.price, b.price) > tolerance) continue;
    const trough = lows.find((l) => l.index > a.index && l.index < b.index);
    if (!trough) continue;
    const depth = pctDiff(trough.price, (a.price + b.price) / 2);
    if (depth < 0.01) continue;
    const confidence = clamp(50 + depth * 400 - pctDiff(a.price, b.price) * 1000, 0, 95);
    hits.push({
      type: 'double_top',
      bullish: false,
      confidence: Math.round(confidence),
      price: (a.price + b.price) / 2,
      index: b.index,
      meta: { peak1: a.index, peak2: b.index, trough: trough.index },
    });
  }

  for (let i = 0; i < lows.length - 1; i++) {
    const a = lows[i]!;
    const b = lows[i + 1]!;
    if (b.index - a.index < 4) continue;
    if (pctDiff(a.price, b.price) > tolerance) continue;
    const peak = highs.find((h) => h.index > a.index && h.index < b.index);
    if (!peak) continue;
    const height = pctDiff(peak.price, (a.price + b.price) / 2);
    if (height < 0.01) continue;
    const confidence = clamp(50 + height * 400 - pctDiff(a.price, b.price) * 1000, 0, 95);
    hits.push({
      type: 'double_bottom',
      bullish: true,
      confidence: Math.round(confidence),
      price: (a.price + b.price) / 2,
      index: b.index,
      meta: { trough1: a.index, trough2: b.index, peak: peak.index },
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Head and shoulders / inverse
// ---------------------------------------------------------------------------
function detectHeadAndShoulders(candles: Candle[], swings: SwingPoint[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const highs = swings.filter((s) => s.type === 'high').sort((a, b) => a.index - b.index);
  const lows = swings.filter((s) => s.type === 'low').sort((a, b) => a.index - b.index);

  for (let i = 0; i < highs.length - 2; i++) {
    const ls = highs[i]!;
    const head = highs[i + 1]!;
    const rs = highs[i + 2]!;
    if (!(head.price > ls.price && head.price > rs.price)) continue;
    if (pctDiff(ls.price, rs.price) > 0.035) continue;
    const troughs = lows
      .filter((l) => l.index > ls.index && l.index < rs.index)
      .sort((a, b) => a.index - b.index);
    if (troughs.length < 2) continue;
    const neck1 = troughs[0]!;
    const neck2 = troughs[troughs.length - 1]!;
    if (pctDiff(neck1.price, neck2.price) > 0.035) continue;
    const shoulderSymmetry = pctDiff(ls.price, rs.price);
    const confidence = clamp(58 + (0.02 - shoulderSymmetry) * 800, 0, 95);
    hits.push({
      type: 'head_and_shoulders',
      bullish: false,
      confidence: Math.round(confidence),
      price: (neck1.price + neck2.price) / 2,
      index: rs.index,
      meta: {
        leftShoulder: ls.index,
        head: head.index,
        rightShoulder: rs.index,
        neckline: (neck1.price + neck2.price) / 2,
      },
    });
  }

  for (let i = 0; i < lows.length - 2; i++) {
    const ls = lows[i]!;
    const head = lows[i + 1]!;
    const rs = lows[i + 2]!;
    if (!(head.price < ls.price && head.price < rs.price)) continue;
    if (pctDiff(ls.price, rs.price) > 0.035) continue;
    const peaks = highs
      .filter((h) => h.index > ls.index && h.index < rs.index)
      .sort((a, b) => a.index - b.index);
    if (peaks.length < 2) continue;
    const neck1 = peaks[0]!;
    const neck2 = peaks[peaks.length - 1]!;
    if (pctDiff(neck1.price, neck2.price) > 0.035) continue;
    const shoulderSymmetry = pctDiff(ls.price, rs.price);
    const confidence = clamp(58 + (0.02 - shoulderSymmetry) * 800, 0, 95);
    hits.push({
      type: 'inverse_head_and_shoulders',
      bullish: true,
      confidence: Math.round(confidence),
      price: (neck1.price + neck2.price) / 2,
      index: rs.index,
      meta: {
        leftShoulder: ls.index,
        head: head.index,
        rightShoulder: rs.index,
        neckline: (neck1.price + neck2.price) / 2,
      },
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Bull / bear flags — impulsive pole followed by a tight counter-sloping
// consolidation channel
// ---------------------------------------------------------------------------
function detectFlags(candles: Candle[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const n = candles.length;
  const poleLen = 10;
  const flagLen = 6;
  if (n < poleLen + flagLen + 1) return hits;

  const flagStart = n - flagLen;
  const poleStart = flagStart - poleLen;
  const poleCandles = candles.slice(poleStart, flagStart);
  const flagCandles = candles.slice(flagStart, n);

  const poleMove = poleCandles[poleCandles.length - 1]!.close - poleCandles[0]!.open;
  const poleRange =
    Math.max(...poleCandles.map((c) => c.high)) - Math.min(...poleCandles.map((c) => c.low));
  const poleMovePct = Math.abs(poleMove) / poleCandles[0]!.open;
  if (poleMovePct < 0.025 || poleRange === 0) return hits;

  const flagCloses = flagCandles.map((c) => c.close);
  const flagSlope = linRegSlope(flagCloses);
  const flagRange =
    Math.max(...flagCandles.map((c) => c.high)) - Math.min(...flagCandles.map((c) => c.low));
  const flagTight = flagRange < poleRange * 0.65;
  if (!flagTight) return hits;

  const last = candles[n - 1]!;
  if (poleMove > 0 && flagSlope <= poleRange * 0.01) {
    const confidence = clamp(55 + poleMovePct * 300 + (flagTight ? 8 : 0), 0, 95);
    hits.push({
      type: 'bull_flag',
      bullish: true,
      confidence: Math.round(confidence),
      price: last.close,
      index: n - 1,
      meta: { poleStart, poleEnd: flagStart - 1, poleMovePct: Math.round(poleMovePct * 10000) / 10000 },
    });
  } else if (poleMove < 0 && flagSlope >= -poleRange * 0.01) {
    const confidence = clamp(55 + poleMovePct * 300 + (flagTight ? 8 : 0), 0, 95);
    hits.push({
      type: 'bear_flag',
      bullish: false,
      confidence: Math.round(confidence),
      price: last.close,
      index: n - 1,
      meta: { poleStart, poleEnd: flagStart - 1, poleMovePct: Math.round(poleMovePct * 10000) / 10000 },
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Triangles — slope of recent swing highs/lows within a lookback window
// ---------------------------------------------------------------------------
function detectTriangles(candles: Candle[], swings: SwingPoint[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const n = candles.length;
  const windowSize = Math.min(60, n);
  const startIdx = n - windowSize;
  const highs = swings
    .filter((s) => s.type === 'high' && s.index >= startIdx)
    .sort((a, b) => a.index - b.index);
  const lows = swings
    .filter((s) => s.type === 'low' && s.index >= startIdx)
    .sort((a, b) => a.index - b.index);
  if (highs.length < 2 || lows.length < 2) return hits;

  const highSlope = linRegSlope(highs.map((h) => h.price));
  const lowSlope = linRegSlope(lows.map((l) => l.price));
  const price = candles[n - 1]!.close;
  const flatTol = price * 0.0015;
  const lastIndex = n - 1;

  const highFlat = Math.abs(highSlope) < flatTol;
  const lowFlat = Math.abs(lowSlope) < flatTol;

  if (highFlat && lowSlope > flatTol) {
    hits.push({
      type: 'ascending_triangle',
      bullish: true,
      confidence: Math.round(clamp(55 + (lowSlope / price) * 50000, 0, 90)),
      price,
      index: lastIndex,
      meta: { highSlope, lowSlope },
    });
  } else if (lowFlat && highSlope < -flatTol) {
    hits.push({
      type: 'descending_triangle',
      bullish: false,
      confidence: Math.round(clamp(55 + (Math.abs(highSlope) / price) * 50000, 0, 90)),
      price,
      index: lastIndex,
      meta: { highSlope, lowSlope },
    });
  } else if (highSlope < -flatTol && lowSlope > flatTol) {
    const recentStart = candles[Math.max(0, n - 10)]!.close;
    hits.push({
      type: 'symmetrical_triangle',
      bullish: price > recentStart,
      confidence: Math.round(
        clamp(50 + ((Math.abs(highSlope) + Math.abs(lowSlope)) / price) * 25000, 0, 90),
      ),
      price,
      index: lastIndex,
      meta: { highSlope, lowSlope },
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Market structure: break of structure (continuation) / change of character
// (first break against the prevailing trend — early reversal signal)
// ---------------------------------------------------------------------------
function detectStructureBreaks(candles: Candle[], swings: SwingPoint[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const highs = swings.filter((s) => s.type === 'high').sort((a, b) => a.index - b.index);
  const lows = swings.filter((s) => s.type === 'low').sort((a, b) => a.index - b.index);
  if (highs.length < 2 || lows.length < 2) return hits;

  const lastClose = candles[candles.length - 1]!.close;
  const lastIndex = candles.length - 1;

  const lastHigh = highs[highs.length - 1]!;
  const prevHigh = highs[highs.length - 2]!;
  const lastLow = lows[lows.length - 1]!;
  const prevLow = lows[lows.length - 2]!;

  const uptrend = lastHigh.price > prevHigh.price && lastLow.price > prevLow.price;
  const downtrend = lastHigh.price < prevHigh.price && lastLow.price < prevLow.price;

  const brokeAboveLastHigh = lastClose > lastHigh.price && lastIndex > lastHigh.index;
  const brokeBelowLastLow = lastClose < lastLow.price && lastIndex > lastLow.index;

  if (uptrend && brokeAboveLastHigh) {
    hits.push({
      type: 'break_of_structure',
      bullish: true,
      confidence: 72,
      price: lastHigh.price,
      index: lastIndex,
      meta: { brokenLevel: lastHigh.index, priorTrend: 'up' },
    });
  } else if (downtrend && brokeBelowLastLow) {
    hits.push({
      type: 'break_of_structure',
      bullish: false,
      confidence: 72,
      price: lastLow.price,
      index: lastIndex,
      meta: { brokenLevel: lastLow.index, priorTrend: 'down' },
    });
  }

  if (downtrend && brokeAboveLastHigh) {
    hits.push({
      type: 'change_of_character',
      bullish: true,
      confidence: 66,
      price: lastHigh.price,
      index: lastIndex,
      meta: { brokenLevel: lastHigh.index, priorTrend: 'down' },
    });
  } else if (uptrend && brokeBelowLastLow) {
    hits.push({
      type: 'change_of_character',
      bullish: false,
      confidence: 66,
      price: lastLow.price,
      index: lastIndex,
      meta: { brokenLevel: lastLow.index, priorTrend: 'up' },
    });
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Order blocks — last opposing candle before a strong impulsive move
// ---------------------------------------------------------------------------
function detectOrderBlocks(candles: Candle[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const n = candles.length;
  const lookback = Math.min(50, n);
  const recent = candles.slice(n - lookback);
  const avgB = avgBody(recent) || 1e-9;

  for (let i = Math.max(1, n - lookback); i < n; i++) {
    const impulse = candles[i]!;
    const body = impulse.close - impulse.open;
    const bodySize = Math.abs(body);
    if (bodySize < avgB * 1.8) continue;

    const prev = candles[i - 1]!;
    const prevBearish = prev.close < prev.open;
    const prevBullish = prev.close > prev.open;

    if (body > 0 && prevBearish) {
      hits.push({
        type: 'order_block',
        bullish: true,
        confidence: Math.round(clamp(55 + (bodySize / avgB) * 8, 0, 90)),
        price: (prev.open + prev.close) / 2,
        index: i - 1,
        meta: { high: prev.high, low: prev.low, impulseIndex: i },
      });
    } else if (body < 0 && prevBullish) {
      hits.push({
        type: 'order_block',
        bullish: false,
        confidence: Math.round(clamp(55 + (bodySize / avgB) * 8, 0, 90)),
        price: (prev.open + prev.close) / 2,
        index: i - 1,
        meta: { high: prev.high, low: prev.low, impulseIndex: i },
      });
    }
  }
  return hits.slice(-5);
}

// ---------------------------------------------------------------------------
// Fair value gaps — 3-candle imbalance where wicks of candle 1/3 don't overlap
// ---------------------------------------------------------------------------
function detectFairValueGaps(candles: Candle[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const n = candles.length;
  const start = Math.max(2, n - 60);
  for (let i = start; i < n; i++) {
    const c1 = candles[i - 2]!;
    const c3 = candles[i]!;
    if (c1.high < c3.low) {
      const gapPct = (c3.low - c1.high) / c1.high;
      if (gapPct < 0.0005) continue;
      hits.push({
        type: 'fair_value_gap',
        bullish: true,
        confidence: Math.round(clamp(50 + gapPct * 4000, 0, 90)),
        price: (c1.high + c3.low) / 2,
        index: i,
        meta: { gapHigh: c3.low, gapLow: c1.high },
      });
    } else if (c1.low > c3.high) {
      const gapPct = (c1.low - c3.high) / c1.low;
      if (gapPct < 0.0005) continue;
      hits.push({
        type: 'fair_value_gap',
        bullish: false,
        confidence: Math.round(clamp(50 + gapPct * 4000, 0, 90)),
        price: (c1.low + c3.high) / 2,
        index: i,
        meta: { gapHigh: c1.low, gapLow: c3.high },
      });
    }
  }
  return hits.slice(-8);
}

// ---------------------------------------------------------------------------
// Liquidity sweeps — wick pierces a prior swing level then closes back inside
// ---------------------------------------------------------------------------
function detectLiquiditySweeps(candles: Candle[], swings: SwingPoint[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const n = candles.length;
  const highs = swings.filter((s) => s.type === 'high').sort((a, b) => a.index - b.index);
  const lows = swings.filter((s) => s.type === 'low').sort((a, b) => a.index - b.index);
  const recentWindow = Math.min(30, n);

  for (let i = Math.max(1, n - recentWindow); i < n; i++) {
    const c = candles[i]!;
    const priorHighs = highs.filter((h) => h.index < i);
    const priorLows = lows.filter((l) => l.index < i);
    const relevantHigh = priorHighs[priorHighs.length - 1];
    const relevantLow = priorLows[priorLows.length - 1];
    const body = Math.abs(c.close - c.open) || 1e-9;

    if (relevantHigh && c.high > relevantHigh.price && c.close < relevantHigh.price) {
      const wick = c.high - Math.max(c.open, c.close);
      if (wick > body * 0.5) {
        hits.push({
          type: 'liquidity_sweep',
          bullish: false,
          confidence: Math.round(clamp(55 + (wick / body) * 5, 0, 90)),
          price: relevantHigh.price,
          index: i,
          meta: { sweptLevel: relevantHigh.index, direction: 'above' },
        });
      }
    }
    if (relevantLow && c.low < relevantLow.price && c.close > relevantLow.price) {
      const wick = Math.min(c.open, c.close) - c.low;
      if (wick > body * 0.5) {
        hits.push({
          type: 'liquidity_sweep',
          bullish: true,
          confidence: Math.round(clamp(55 + (wick / body) * 5, 0, 90)),
          price: relevantLow.price,
          index: i,
          meta: { sweptLevel: relevantLow.index, direction: 'below' },
        });
      }
    }
  }
  return hits.slice(-5);
}

// ---------------------------------------------------------------------------
// Trendline break — linear regression through recent swing lows/highs
// ---------------------------------------------------------------------------
function detectTrendlineBreaks(candles: Candle[], swings: SwingPoint[]): PatternHit[] {
  const hits: PatternHit[] = [];
  const n = candles.length;
  const lows = swings
    .filter((s) => s.type === 'low')
    .sort((a, b) => a.index - b.index)
    .slice(-5);
  const highs = swings
    .filter((s) => s.type === 'high')
    .sort((a, b) => a.index - b.index)
    .slice(-5);
  const lastClose = candles[n - 1]!.close;
  const lastIndex = n - 1;

  const fitLine = (points: SwingPoint[]): { slope: number; intercept: number } | null => {
    if (points.length < 2) return null;
    const xs = points.map((p) => p.index);
    const ys = points.map((p) => p.price);
    const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i]! - xMean) * (ys[i]! - yMean);
      den += (xs[i]! - xMean) ** 2;
    }
    if (den === 0) return null;
    const slope = num / den;
    return { slope, intercept: yMean - slope * xMean };
  };

  const supportLine = fitLine(lows);
  if (supportLine) {
    const projected = supportLine.slope * lastIndex + supportLine.intercept;
    if (projected > 0 && lastClose < projected * 0.998 && supportLine.slope >= 0) {
      hits.push({
        type: 'trendline_break',
        bullish: false,
        confidence: Math.round(
          clamp(55 + (Math.abs(projected - lastClose) / projected) * 1000, 0, 90),
        ),
        price: projected,
        index: lastIndex,
        meta: { line: 'support', slope: supportLine.slope },
      });
    }
  }

  const resistanceLine = fitLine(highs);
  if (resistanceLine) {
    const projected = resistanceLine.slope * lastIndex + resistanceLine.intercept;
    if (projected > 0 && lastClose > projected * 1.002 && resistanceLine.slope <= 0) {
      hits.push({
        type: 'trendline_break',
        bullish: true,
        confidence: Math.round(
          clamp(55 + (Math.abs(lastClose - projected) / projected) * 1000, 0, 90),
        ),
        price: projected,
        index: lastIndex,
        meta: { line: 'resistance', slope: resistanceLine.slope },
      });
    }
  }
  return hits;
}

/**
 * Run the full heuristic pattern-detection suite over a candle series.
 * Results are sorted with the most recent (highest index) hits first.
 */
export function detectPatterns(candles: Candle[], indicators: IndicatorSnapshot): PatternHit[] {
  if (candles.length < 15) return [];
  const swings = findSwingPoints(candles, 3);

  const hits: PatternHit[] = [
    ...detectSupportResistance(candles, swings, indicators),
    ...detectDoubleTopBottom(candles, swings),
    ...detectHeadAndShoulders(candles, swings),
    ...detectFlags(candles),
    ...detectTriangles(candles, swings),
    ...detectStructureBreaks(candles, swings),
    ...detectOrderBlocks(candles),
    ...detectFairValueGaps(candles),
    ...detectLiquiditySweeps(candles, swings),
    ...detectTrendlineBreaks(candles, swings),
  ];

  return hits.sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
}
