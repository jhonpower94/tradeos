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

const ID = 'rsi_divergence' as const;
const LOOKBACK = 40;
const MIN_SWING_GAP = 5;
const PIVOT = 2;

type Swing = { index: number; price: number; rsi: number };

function findSwingLows(closes: number[], rsi: number[], from: number, to: number): Swing[] {
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
    const r = rsi[i];
    if (r == null || !Number.isFinite(r)) continue;
    swings.push({ index: i, price: c, rsi: r });
  }
  return swings;
}

function findSwingHighs(closes: number[], rsi: number[], from: number, to: number): Swing[] {
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
    const r = rsi[i];
    if (r == null || !Number.isFinite(r)) continue;
    swings.push({ index: i, price: c, rsi: r });
  }
  return swings;
}

/** Exported for unit tests. */
export function detectRsiDivergence(
  closes: number[],
  rsi: (number | null)[],
): { kind: 'bullish' | 'bearish'; older: Swing; newer: Swing } | null {
  const n = closes.length;
  if (n < LOOKBACK || rsi.length < n) return null;
  const from = Math.max(0, n - LOOKBACK);
  const to = n - 1;
  const rsiNums = rsi.map((v) => (v == null ? NaN : v));

  const lows = findSwingLows(closes, rsiNums, from, to);
  if (lows.length >= 2) {
    for (let i = lows.length - 1; i >= 1; i--) {
      const newer = lows[i]!;
      for (let j = i - 1; j >= 0; j--) {
        const older = lows[j]!;
        if (newer.index - older.index < MIN_SWING_GAP) continue;
        if (newer.price < older.price && newer.rsi > older.rsi) {
          return { kind: 'bullish', older, newer };
        }
        break;
      }
    }
  }

  const highs = findSwingHighs(closes, rsiNums, from, to);
  if (highs.length >= 2) {
    for (let i = highs.length - 1; i >= 1; i--) {
      const newer = highs[i]!;
      for (let j = i - 1; j >= 0; j--) {
        const older = highs[j]!;
        if (newer.index - older.index < MIN_SWING_GAP) continue;
        if (newer.price > older.price && newer.rsi < older.rsi) {
          return { kind: 'bearish', older, newer };
        }
        break;
      }
    }
  }

  return null;
}

export const rsiDivergenceStrategy: Strategy = {
  id: ID,
  name: 'RSI Divergence',
  description:
    'Regular RSI divergence: price makes a new extreme while RSI fails to confirm — exhaustion setup.',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last || candles.length < LOOKBACK) return noTrade(ID);

    const rsi = indicators.rsi14;
    if (!rsi || rsi.length < candles.length) {
      return noTrade(ID, [evidence(ID, 'Insufficient RSI data')]);
    }

    const closes = candles.map((c) => c.close);
    const div = detectRsiDivergence(closes, rsi);
    if (!div) {
      return noTrade(ID, [evidence('rsi', 'No regular RSI divergence')]);
    }
    if (candles.length - 1 - div.newer.index > 5) {
      return noTrade(ID, [evidence('rsi', 'Divergence swing too old')]);
    }

    const atr = getAtr(indicators, last.close);
    const priceGapPct = Math.abs(div.newer.price - div.older.price) / (div.older.price || 1e-9);
    const rsiGap = Math.abs(div.newer.rsi - div.older.rsi);

    if (div.kind === 'bullish') {
      const levels = buildLongLevels(last.close, atr);
      const confidence = clamp(58 + priceGapPct * 400 + rsiGap * 0.4, 0, 92);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: [
          evidence(
            'rsi',
            `Bullish RSI divergence: price LL, RSI HL (${div.older.rsi.toFixed(1)}→${div.newer.rsi.toFixed(1)})`,
            1,
          ),
        ],
      };
    }

    const levels = buildShortLevels(last.close, atr);
    const confidence = clamp(58 + priceGapPct * 400 + rsiGap * 0.4, 0, 92);
    return {
      strategyId: ID,
      decision: Decision.SELL,
      confidence: Math.round(confidence),
      ...levels,
      evidence: [
        evidence(
          'rsi',
          `Bearish RSI divergence: price HH, RSI LH (${div.older.rsi.toFixed(1)}→${div.newer.rsi.toFixed(1)})`,
          1,
        ),
      ],
    };
  },
};
