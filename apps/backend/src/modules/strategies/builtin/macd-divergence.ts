import { Decision } from '@trading-os/shared';
import type { Strategy, StrategyContext } from '../types.js';
import {
  buildLongLevels,
  buildShortLevels,
  clamp,
  evidence,
  getAtr,
  lastCandle,
  noTrade,
} from '../utils.js';

const ID = 'macd_divergence' as const;
const LOOKBACK = 40;
const MIN_SWING_GAP = 5;
const PIVOT = 2;

type Swing = { index: number; price: number; hist: number };

function findSwingLows(closes: number[], hist: number[], from: number, to: number): Swing[] {
  const swings: Swing[] = [];
  for (let i = from + PIVOT; i <= to - PIVOT; i++) {
    const c = closes[i]!;
    let isLow = true;
    for (let k = 1; k <= PIVOT; k++) {
      if (c > closes[i - k]! || c > closes[i + k]!) {
        isLow = false;
        break;
      }
    }
    if (!isLow) continue;
    const h = hist[i];
    if (h == null || !Number.isFinite(h)) continue;
    swings.push({ index: i, price: c, hist: h });
  }
  return swings;
}

function findSwingHighs(closes: number[], hist: number[], from: number, to: number): Swing[] {
  const swings: Swing[] = [];
  for (let i = from + PIVOT; i <= to - PIVOT; i++) {
    const c = closes[i]!;
    let isHigh = true;
    for (let k = 1; k <= PIVOT; k++) {
      if (c < closes[i - k]! || c < closes[i + k]!) {
        isHigh = false;
        break;
      }
    }
    if (!isHigh) continue;
    const h = hist[i];
    if (h == null || !Number.isFinite(h)) continue;
    swings.push({ index: i, price: c, hist: h });
  }
  return swings;
}

/** Exported for unit tests. */
export function detectMacdDivergence(
  closes: number[],
  histogram: (number | null)[],
): { kind: 'bullish' | 'bearish'; older: Swing; newer: Swing } | null {
  const n = closes.length;
  if (n < LOOKBACK || histogram.length < n) return null;
  const from = Math.max(0, n - LOOKBACK);
  const to = n - 1;
  const histNums = histogram.map((v) => (v == null ? NaN : v));

  const lows = findSwingLows(closes, histNums, from, to);
  if (lows.length >= 2) {
    for (let i = lows.length - 1; i >= 1; i--) {
      const newer = lows[i]!;
      for (let j = i - 1; j >= 0; j--) {
        const older = lows[j]!;
        if (newer.index - older.index < MIN_SWING_GAP) continue;
        if (newer.price < older.price && newer.hist > older.hist) {
          return { kind: 'bullish', older, newer };
        }
        break;
      }
    }
  }

  const highs = findSwingHighs(closes, histNums, from, to);
  if (highs.length >= 2) {
    for (let i = highs.length - 1; i >= 1; i--) {
      const newer = highs[i]!;
      for (let j = i - 1; j >= 0; j--) {
        const older = highs[j]!;
        if (newer.index - older.index < MIN_SWING_GAP) continue;
        if (newer.price > older.price && newer.hist < older.hist) {
          return { kind: 'bearish', older, newer };
        }
        break;
      }
    }
  }

  return null;
}

export const macdDivergenceStrategy: Strategy = {
  id: ID,
  name: 'MACD Divergence',
  description:
    'Regular MACD histogram divergence: price makes a new extreme while histogram fails to confirm.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last || candles.length < LOOKBACK) return noTrade(ID);

    const hist = indicators.macd?.histogram;
    if (!hist || hist.length < candles.length) {
      return noTrade(ID, [evidence(ID, 'Insufficient MACD histogram data')]);
    }

    const closes = candles.map((c) => c.close);
    const div = detectMacdDivergence(closes, hist);
    if (!div) {
      return noTrade(ID, [evidence('macd', 'No regular MACD histogram divergence')]);
    }
    if (candles.length - 1 - div.newer.index > 5) {
      return noTrade(ID, [evidence('macd', 'Divergence swing too old')]);
    }

    const atr = getAtr(indicators, last.close);
    const priceGapPct = Math.abs(div.newer.price - div.older.price) / (div.older.price || 1e-9);
    const histGap = Math.abs(div.newer.hist - div.older.hist);

    if (div.kind === 'bullish') {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(58 + priceGapPct * 400 + histGap * 50, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            'macd',
            `Bullish MACD hist divergence: price LL, hist HL (${div.older.hist.toFixed(4)}→${div.newer.hist.toFixed(4)})`,
            1,
          ),
        ],
      };
    }

    const levels = buildShortLevels(last.close, atr);
    const confidence = clamp(58 + priceGapPct * 400 + histGap * 50, 0, 92);
    return {
      strategyId: ID,
      decision: Decision.SELL,
      confidence: Math.round(confidence),
      ...levels,
      evidence: [
        evidence(
          'macd',
          `Bearish MACD hist divergence: price HH, hist LH (${div.older.hist.toFixed(4)}→${div.newer.hist.toFixed(4)})`,
          1,
        ),
      ],
    };
  },
};
