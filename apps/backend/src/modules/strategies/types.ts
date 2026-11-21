import type {
  Candle,
  IndicatorSnapshot,
  PatternHit,
  StrategyId,
  StrategyResult,
} from '@trading-os/shared';

export interface StrategyContext {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  indicators: IndicatorSnapshot;
  patterns: PatternHit[];
  params?: Record<string, unknown>;
  /** When false, skip isAlreadyExtended gates (RR / support bounce). Default true. */
  antiExtensionEnabled?: boolean;
}

export interface Strategy {
  id: StrategyId;
  name: string;
  description: string;
  evaluate(ctx: StrategyContext): StrategyResult;
}
