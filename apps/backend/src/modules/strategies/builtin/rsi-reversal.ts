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
import { detectRsiDivergence } from './rsi-divergence.js';

const ID = 'rsi_reversal' as const;
const RSI_PERIOD = 14;
const LOOKBACK = 40;
const THRESHOLD_HIGH = 70; // exit overbought
const THRESHOLD_LOW = 30; // exit oversold

function thresholdExit(rsi: (number | null)[]): 'bullish' | 'bearish' | null {
  if (!rsi || rsi.length < 2) return null;
  const last = rsi[rsi.length - 1];
  const prev = rsi[rsi.length - 2];
  if (last == null || prev == null) return null;
  // Bearish: RSI was above THRESHOLD_HIGH and fell below it
  if (prev > THRESHOLD_HIGH && last <= THRESHOLD_HIGH) return 'bearish';
  // Bullish: RSI was below THRESHOLD_LOW and rose above it
  if (prev < THRESHOLD_LOW && last >= THRESHOLD_LOW) return 'bullish';
  return null;
}

export const rsiReversalStrategy: Strategy = {
  id: ID,
  name: 'RSI Reversal',
  description: 'Signals reversals using RSI divergence and threshold exit (overbought/oversold).',
  evaluate(ctx: StrategyContext) {
    const { candles, indicators } = ctx;
    const last = lastCandle(candles);
    if (!last || candles.length < LOOKBACK) return noTrade(ID);

    const rsi = indicators.rsi14;
    if (!rsi || rsi.length < candles.length) return noTrade(ID, [evidence(ID, 'Insufficient RSI data')]);

    const closes = candles.map((c) => c.close);
    const div = detectRsiDivergence(closes, rsi);
    const thresh = thresholdExit(rsi);

    if (!div && !thresh) return noTrade(ID, [evidence('rsi', 'No divergence or threshold exit')]);

    const atr = getAtr(indicators, last.close);
    let confidence = 50;
    const evidenceItems = [] as ReturnType<typeof evidence>[];

    if (div) {
      const priceGapPct = Math.abs(div.newer.price - div.older.price) / (div.older.price || 1e-9);
      const rsiGap = Math.abs(div.newer.rsi - div.older.rsi);
      confidence += Math.min(30, 20 + priceGapPct * 200 + rsiGap * 0.5);
      evidenceItems.push(
        evidence(
          'rsi',
          `${div.kind === 'bullish' ? 'Bullish' : 'Bearish'} RSI divergence (${div.older.rsi.toFixed(1)}→${div.newer.rsi.toFixed(1)})`,
          1,
        ),
      );
    }

    if (thresh) {
      confidence += 20;
      evidenceItems.push(evidence('rsi', `RSI threshold exit (${thresh})`, 0.8));
    }

    confidence = clamp(confidence, 0, 95);

    if (div?.kind === 'bullish' || thresh === 'bullish') {
      const levels = buildLongLevels(last.close, atr);
      return {
        strategyId: ID,
        decision: Decision.BUY,
        confidence: Math.round(confidence),
        ...levels,
        evidence: evidenceItems,
      };
    }

    const levels = buildShortLevels(last.close, atr);
    return {
      strategyId: ID,
      decision: Decision.SELL,
      confidence: Math.round(confidence),
      ...levels,
      evidence: evidenceItems,
    };
  },
};
