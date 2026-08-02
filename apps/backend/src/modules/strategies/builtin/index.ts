import type { Strategy } from '../types.js';
import { emaPullbackStrategy } from './ema-pullback.js';
import { emaCrossStrategy } from './ema-cross.js';
import { macdMomentumStrategy } from './macd-momentum.js';
import { rsiPullbackStrategy } from './rsi-pullback.js';
import { vwapReversionStrategy } from './vwap-reversion.js';
import { atrTrendStrategy } from './atr-trend.js';
import { supertrendStrategy } from './supertrend.js';
import { bollingerReversalStrategy } from './bollinger-reversal.js';
import { breakoutStrategy } from './breakout.js';
import { trendContinuationStrategy } from './trend-continuation.js';
import { supportBounceStrategy } from './support-bounce.js';
import { resistanceRejectionStrategy } from './resistance-rejection.js';
import { breakOfStructureStrategy } from './break-of-structure.js';
import { changeOfCharacterStrategy } from './change-of-character.js';
import { orderBlockStrategy } from './order-block.js';
import { fairValueGapStrategy } from './fair-value-gap.js';
import { liquiditySweepStrategy } from './liquidity-sweep.js';
import { volumeBreakoutStrategy } from './volume-breakout.js';

export {
  emaPullbackStrategy,
  emaCrossStrategy,
  macdMomentumStrategy,
  rsiPullbackStrategy,
  vwapReversionStrategy,
  atrTrendStrategy,
  supertrendStrategy,
  bollingerReversalStrategy,
  breakoutStrategy,
  trendContinuationStrategy,
  supportBounceStrategy,
  resistanceRejectionStrategy,
  breakOfStructureStrategy,
  changeOfCharacterStrategy,
  orderBlockStrategy,
  fairValueGapStrategy,
  liquiditySweepStrategy,
  volumeBreakoutStrategy,
};

/** All built-in strategies, in the same order as `STRATEGY_IDS`. */
export const builtinStrategies: Strategy[] = [
  emaPullbackStrategy,
  emaCrossStrategy,
  macdMomentumStrategy,
  rsiPullbackStrategy,
  vwapReversionStrategy,
  atrTrendStrategy,
  supertrendStrategy,
  bollingerReversalStrategy,
  breakoutStrategy,
  trendContinuationStrategy,
  supportBounceStrategy,
  resistanceRejectionStrategy,
  breakOfStructureStrategy,
  changeOfCharacterStrategy,
  orderBlockStrategy,
  fairValueGapStrategy,
  liquiditySweepStrategy,
  volumeBreakoutStrategy,
];
