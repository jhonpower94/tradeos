import {
  MarketRegime,
  type Evidence,
  type IndicatorSnapshot,
} from '@trading-os/shared';
import { lastValid } from '../indicators/index.js';

export interface RegimeResult {
  regime: MarketRegime;
  confidence: number;
  evidence: Evidence[];
  adx: number;
  bbWidthPct: number;
}

const ADX_TREND = 25;
const ADX_RANGE = 20;
const BB_VOLATILE_WIDTH = 8;

/**
 * Classify market regime from indicator snapshot.
 * Runs before strategies so only regime-compatible strategies are evaluated.
 */
export function detectRegime(indicators: IndicatorSnapshot): RegimeResult {
  const adx = lastValid(indicators.adx14?.adx) ?? 0;
  const plus = lastValid(indicators.adx14?.plusDI) ?? 0;
  const minus = lastValid(indicators.adx14?.minusDI) ?? 0;
  const upper = lastValid(indicators.bollinger?.upper);
  const lower = lastValid(indicators.bollinger?.lower);
  const mid = lastValid(indicators.bollinger?.middle);
  const bbWidthPct =
    upper != null && lower != null && mid != null && mid !== 0
      ? ((upper - lower) / mid) * 100
      : 0;

  const evidence: Evidence[] = [
    {
      source: 'regime',
      label: `ADX ${adx.toFixed(1)}`,
      detail: `+DI ${plus.toFixed(1)} / -DI ${minus.toFixed(1)}`,
    },
    {
      source: 'regime',
      label: `BB width ${bbWidthPct.toFixed(2)}%`,
    },
  ];

  let regime: MarketRegime;
  let confidence: number;

  if (bbWidthPct > BB_VOLATILE_WIDTH && adx < ADX_RANGE) {
    regime = MarketRegime.VOLATILE;
    confidence = Math.min(95, 55 + bbWidthPct * 2);
    evidence.push({ source: 'regime', label: 'Wide bands + weak ADX → volatile' });
  } else if (adx >= ADX_TREND) {
    regime =
      plus > minus ? MarketRegime.TRENDING_BULL : MarketRegime.TRENDING_BEAR;
    confidence = Math.min(95, 50 + (adx - ADX_TREND) * 2);
    evidence.push({
      source: 'regime',
      label:
        regime === MarketRegime.TRENDING_BULL
          ? 'Strong ADX bullish trend'
          : 'Strong ADX bearish trend',
    });
  } else if (adx < ADX_RANGE) {
    regime = MarketRegime.RANGING;
    confidence = Math.min(90, 60 + (ADX_RANGE - adx) * 2);
    evidence.push({ source: 'regime', label: 'Low ADX → ranging' });
  } else {
    regime = MarketRegime.UNKNOWN;
    confidence = 30;
    evidence.push({ source: 'regime', label: 'Ambiguous ADX zone → unknown' });
  }

  return {
    regime,
    confidence: Math.round(Math.max(0, Math.min(100, confidence))),
    evidence,
    adx,
    bbWidthPct,
  };
}

/** Legacy helper returning enum only (for callers that only need the label). */
export function detectRegimeLabel(indicators: IndicatorSnapshot): MarketRegime {
  return detectRegime(indicators).regime;
}
