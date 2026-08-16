import { STRATEGY_IDS, type StrategyId } from './index.js';

export type ScannerEntryStyle = 'confirmed' | 'early';
export type EntryTiming = 'early' | 'confirmed' | 'mixed';

/** Pullback / reclaim / ignition / structure setups preferred for early entry. */
export const EARLY_STRATEGY_PACK = [
  'ema_pullback',
  'rsi_pullback',
  'order_block',
  'fair_value_gap',
  'change_of_character',
  'adx_ignition',
  'bb_squeeze_breakout',
  'inside_bar_nr7',
  'support_bounce',
  'resistance_rejection',
  'liquidity_sweep',
] as const satisfies readonly StrategyId[];

/** Lagging trend-confirmation strategies preferred off in Early profile. */
export const LAGGING_STRATEGY_PACK = [
  'supertrend',
  'ichimoku_trend',
  'trend_continuation',
  'atr_trend',
  'ema_cross',
  'macd_momentum',
] as const satisfies readonly StrategyId[];

const EARLY_SET = new Set<string>(EARLY_STRATEGY_PACK);
const LAGGING_SET = new Set<string>(LAGGING_STRATEGY_PACK);

export function isEarlyPackStrategy(id: string): boolean {
  return EARLY_SET.has(id);
}

export function isLaggingPackStrategy(id: string): boolean {
  return LAGGING_SET.has(id);
}

export function countEarlyPackVoters(strategyIds: readonly string[]): number {
  return strategyIds.filter((id) => EARLY_SET.has(id)).length;
}

export function countLaggingPackVoters(strategyIds: readonly string[]): number {
  return strategyIds.filter((id) => LAGGING_SET.has(id)).length;
}

/** Classify signal timing from which strategy packs voted. */
export function deriveEntryTiming(strategyIds: readonly string[]): EntryTiming {
  const early = countEarlyPackVoters(strategyIds);
  const lagging = countLaggingPackVoters(strategyIds);
  if (early > 0 && lagging === 0) return 'early';
  if (lagging > 0 && early === 0) return 'confirmed';
  if (early > 0 && lagging > 0) return 'mixed';
  return 'confirmed';
}

export interface ScannerPresetPayload {
  scanner: {
    entryStyle: ScannerEntryStyle;
    minAlignedStrategies: number;
    minConfidence: number;
    minAgreementRatio: number;
    htfVetoEnabled: true;
  };
  strategies: Record<StrategyId, { enabled: boolean; params: Record<string, unknown> }>;
}

function strategyEnableMap(
  laggingEnabled: boolean,
): Record<StrategyId, { enabled: boolean; params: Record<string, unknown> }> {
  const map = {} as Record<StrategyId, { enabled: boolean; params: Record<string, unknown> }>;
  for (const id of STRATEGY_IDS) {
    const enabled = LAGGING_SET.has(id) ? laggingEnabled : true;
    map[id] = { enabled, params: {} };
  }
  return map;
}

/** Apply Confirmed or Early entry profile into existing scanner + strategies settings fields. */
export function applyScannerPreset(style: ScannerEntryStyle): ScannerPresetPayload {
  if (style === 'early') {
    return {
      scanner: {
        entryStyle: 'early',
        minAlignedStrategies: 1,
        minConfidence: 68,
        minAgreementRatio: 0.55,
        htfVetoEnabled: true,
      },
      strategies: strategyEnableMap(false),
    };
  }
  return {
    scanner: {
      entryStyle: 'confirmed',
      minAlignedStrategies: 2,
      minConfidence: 75,
      minAgreementRatio: 0.6,
      htfVetoEnabled: true,
    },
    strategies: strategyEnableMap(true),
  };
}

/** Build a strategies PATCH that enables/disables every id in a pack. */
export function strategyPackPatch(
  pack: readonly StrategyId[],
  enabled: boolean,
): Record<string, { enabled: boolean; params: Record<string, unknown> }> {
  const out: Record<string, { enabled: boolean; params: Record<string, unknown> }> = {};
  for (const id of pack) {
    out[id] = { enabled, params: {} };
  }
  return out;
}

export function isPackFullyEnabled(
  strategies: Record<string, { enabled?: boolean } | undefined> | undefined,
  pack: readonly StrategyId[],
): boolean {
  if (!strategies) return true;
  return pack.every((id) => strategies[id]?.enabled !== false);
}
