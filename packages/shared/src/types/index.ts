import type { Decision, MarketRegime, Side, StrategyId, Timeframe } from '../constants/index.js';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface Evidence {
  source: string;
  label: string;
  weight?: number;
  detail?: string;
}

export interface StrategyResult {
  strategyId: StrategyId;
  decision: Decision;
  confidence: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  evidence: Evidence[];
}

export interface ConsensusResult {
  score: number;
  regime: MarketRegime;
  side: Side | null;
  evidence: Evidence[];
  veto?: string;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskReward?: number;
  primaryStrategy?: StrategyId;
  strategyIds: StrategyId[];
}

export interface Opportunity {
  symbol: string;
  timeframe: Timeframe;
  side: Side;
  confidence: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  strategyIds: StrategyId[];
  primaryStrategy: StrategyId;
  evidence: Evidence[];
  regime: MarketRegime;
  estimatedDuration?: string;
  rank?: number;
}

export interface RiskValidationResult {
  ok: boolean;
  qty?: number;
  riskAmount?: number;
  reasons: string[];
}

export interface IndicatorSeries {
  values: (number | null)[];
}

export interface IndicatorSnapshot {
  ema9?: number[];
  ema21?: number[];
  ema50?: number[];
  ema200?: number[];
  sma20?: number[];
  sma50?: number[];
  rsi14?: number[];
  macd?: { macd: number[]; signal: number[]; histogram: number[] };
  adx14?: { adx: number[]; plusDI: number[]; minusDI: number[] };
  atr14?: number[];
  vwap?: number[];
  supertrend?: { value: number[]; direction: number[] };
  bollinger?: { upper: number[]; middle: number[]; lower: number[] };
  stochRsi?: { k: number[]; d: number[] };
  cci20?: number[];
  roc12?: number[];
  obv?: number[];
  mfi14?: number[];
  volume?: number[];
  volumeMa20?: number[];
  donchian?: { upper: number[]; middle: number[]; lower: number[] };
  ichimoku?: {
    tenkan: number[];
    kijun: number[];
    senkouA: number[];
    senkouB: number[];
    chikou: number[];
  };
  parabolicSar?: number[];
  pivots?: {
    pivot: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  };
}

export type PatternType =
  | 'support'
  | 'resistance'
  | 'double_top'
  | 'double_bottom'
  | 'head_and_shoulders'
  | 'inverse_head_and_shoulders'
  | 'bull_flag'
  | 'bear_flag'
  | 'ascending_triangle'
  | 'descending_triangle'
  | 'symmetrical_triangle'
  | 'break_of_structure'
  | 'change_of_character'
  | 'order_block'
  | 'fair_value_gap'
  | 'liquidity_sweep'
  | 'trendline_break';

export interface PatternHit {
  type: PatternType;
  bullish: boolean;
  confidence: number;
  price?: number;
  index?: number;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface BacktestMetrics {
  winRate: number;
  lossRate: number;
  profitFactor: number;
  maxDrawdown: number;
  averageProfit: number;
  averageLoss: number;
  totalTrades: number;
  netProfit: number;
  sharpeRatio?: number;
}
