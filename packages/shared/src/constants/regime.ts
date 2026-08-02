import { MarketRegime, STRATEGY_IDS, type StrategyId } from './index.js';

/** Regimes each built-in strategy is designed for. */
export const STRATEGY_REGIME_COMPATIBILITY: Record<StrategyId, MarketRegime[]> = {
  ema_pullback: [MarketRegime.TRENDING_BULL, MarketRegime.TRENDING_BEAR],
  ema_cross: [MarketRegime.TRENDING_BULL, MarketRegime.TRENDING_BEAR],
  macd_momentum: [MarketRegime.TRENDING_BULL, MarketRegime.TRENDING_BEAR],
  rsi_pullback: [
    MarketRegime.TRENDING_BULL,
    MarketRegime.TRENDING_BEAR,
    MarketRegime.RANGING,
  ],
  vwap_reversion: [MarketRegime.RANGING, MarketRegime.VOLATILE],
  atr_trend: [MarketRegime.TRENDING_BULL, MarketRegime.TRENDING_BEAR],
  supertrend: [MarketRegime.TRENDING_BULL, MarketRegime.TRENDING_BEAR],
  bollinger_reversal: [MarketRegime.RANGING, MarketRegime.VOLATILE],
  breakout: [
    MarketRegime.TRENDING_BULL,
    MarketRegime.TRENDING_BEAR,
    MarketRegime.VOLATILE,
  ],
  trend_continuation: [MarketRegime.TRENDING_BULL, MarketRegime.TRENDING_BEAR],
  support_bounce: [MarketRegime.RANGING],
  resistance_rejection: [MarketRegime.RANGING, MarketRegime.TRENDING_BEAR],
  break_of_structure: [MarketRegime.TRENDING_BULL, MarketRegime.TRENDING_BEAR],
  change_of_character: [MarketRegime.TRENDING_BULL, MarketRegime.TRENDING_BEAR],
  order_block: [
    MarketRegime.TRENDING_BULL,
    MarketRegime.TRENDING_BEAR,
    MarketRegime.RANGING,
  ],
  fair_value_gap: [
    MarketRegime.TRENDING_BULL,
    MarketRegime.TRENDING_BEAR,
    MarketRegime.RANGING,
  ],
  liquidity_sweep: [MarketRegime.RANGING, MarketRegime.VOLATILE],
  volume_breakout: [
    MarketRegime.TRENDING_BULL,
    MarketRegime.TRENDING_BEAR,
    MarketRegime.VOLATILE,
  ],
};

export function getCompatibleStrategyIds(regime: MarketRegime): StrategyId[] {
  if (regime === MarketRegime.UNKNOWN) return [];
  return STRATEGY_IDS.filter((id) =>
    STRATEGY_REGIME_COMPATIBILITY[id].includes(regime),
  );
}

export function isStrategyCompatibleWithRegime(
  strategyId: StrategyId,
  regime: MarketRegime,
): boolean {
  if (regime === MarketRegime.UNKNOWN) return false;
  return STRATEGY_REGIME_COMPATIBILITY[strategyId]?.includes(regime) ?? false;
}

export type EnabledStrategyMap = Record<string, { enabled: boolean; params?: Record<string, unknown> }>;

/** Intersect user-enabled strategies with those compatible with the regime. */
export function filterStrategiesForRegime(
  enabledMap: EnabledStrategyMap | undefined,
  regime: MarketRegime,
): EnabledStrategyMap {
  const compatible = new Set(getCompatibleStrategyIds(regime));
  const result: EnabledStrategyMap = {};

  for (const id of STRATEGY_IDS) {
    const userEnabled = enabledMap?.[id]?.enabled !== false;
    const ok = userEnabled && compatible.has(id);
    result[id] = {
      enabled: ok,
      params: enabledMap?.[id]?.params ?? {},
    };
  }
  return result;
}
