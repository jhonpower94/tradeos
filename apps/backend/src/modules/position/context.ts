import {
  MarketRegime,
  PositionStatus,
  Side,
  Timeframe,
} from '@trading-os/shared';
import { Position } from '../../models/Position.js';
import { Trade } from '../../models/Trade.js';
import { Signal } from '../../models/Signal.js';
import { marketDataService } from '../market-data/index.js';
import { computeAllIndicators, INDICATOR_MIN_PERIODS } from '../indicators/index.js';
import { detectRegime } from '../regime/index.js';
import { detectHtfTrend, resolveParentTimeframe, type HtfTrend } from '../consensus/htf.js';
import { AppError } from '../../utils/errors.js';

export type PositionSuggestion = 'hold' | 'consider_close';

export interface PositionMarketContext {
  positionId: string;
  tradeId: string;
  symbol: string;
  side: Side;
  timeframe: string;
  regime: MarketRegime;
  regimeConfidence: number;
  htfTrend: HtfTrend | null;
  htfTimeframe: string | null;
  regimeOpposing: boolean;
  htfOpposing: boolean;
  aligned: boolean;
  suggestion: PositionSuggestion;
  message: string;
}

/** Pure bias evaluation for tests and context builder. */
export function evaluatePositionBias(input: {
  side: Side;
  regime: MarketRegime;
  plusDI?: number;
  minusDI?: number;
  htfTrend: HtfTrend | null;
}): {
  regimeOpposing: boolean;
  htfOpposing: boolean;
  aligned: boolean;
  suggestion: PositionSuggestion;
  message: string;
} {
  const { side, regime, htfTrend } = input;
  const plus = input.plusDI ?? 0;
  const minus = input.minusDI ?? 0;

  let regimeOpposing = false;
  if (side === Side.BUY) {
    if (regime === MarketRegime.TRENDING_BEAR) regimeOpposing = true;
    else if (regime === MarketRegime.TRENDING_VOLATILE && minus > plus) regimeOpposing = true;
  } else {
    if (regime === MarketRegime.TRENDING_BULL) regimeOpposing = true;
    else if (regime === MarketRegime.TRENDING_VOLATILE && plus > minus) regimeOpposing = true;
  }

  const htfOpposing =
    htfTrend != null &&
    ((side === Side.BUY && htfTrend === 'bear') || (side === Side.SELL && htfTrend === 'bull'));

  const opposing = regimeOpposing || htfOpposing;
  if (!opposing) {
    const bits: string[] = [];
    if (htfTrend) bits.push(`HTF ${htfTrend} aligned`);
    bits.push(`regime ${regime}`);
    return {
      regimeOpposing: false,
      htfOpposing: false,
      aligned: true,
      suggestion: 'hold',
      message: `Aligned — hold (${bits.join(', ')})`,
    };
  }

  const reasons: string[] = [];
  if (htfOpposing) reasons.push(`HTF ${htfTrend} vs ${side}`);
  if (regimeOpposing) reasons.push(`regime ${regime} vs ${side}`);
  return {
    regimeOpposing,
    htfOpposing,
    aligned: false,
    suggestion: 'consider_close',
    message: `${reasons.join('; ')} — consider close`,
  };
}

async function resolveTimeframe(tradeId: unknown): Promise<Timeframe> {
  const trade = await Trade.findById(tradeId).lean();
  if (trade?.signalId) {
    const signal = await Signal.findById(trade.signalId).select('timeframe').lean();
    if (signal?.timeframe && Object.values(Timeframe).includes(signal.timeframe as Timeframe)) {
      return signal.timeframe as Timeframe;
    }
  }
  return Timeframe.H1;
}

export async function getPositionMarketContext(
  userId: string,
  positionId: string,
): Promise<PositionMarketContext> {
  const position = await Position.findOne({ _id: positionId, userId });
  if (!position) throw new AppError('NOT_FOUND', 'Position not found', 404);

  const timeframe = await resolveTimeframe(position.tradeId);
  const side = position.side as Side;
  const symbol = position.symbol;

  let regime = MarketRegime.UNKNOWN;
  let regimeConfidence = 0;
  let plusDI = 0;
  let minusDI = 0;

  try {
    const candles = await marketDataService.getCandles(
      symbol,
      timeframe,
      Math.max(INDICATOR_MIN_PERIODS, 250),
    );
    if (candles.length >= 50) {
      const indicators = computeAllIndicators(candles);
      const result = detectRegime(indicators);
      regime = result.regime;
      regimeConfidence = result.confidence;
      plusDI = result.plusDI;
      minusDI = result.minusDI;
    }
  } catch {
    // leave unknown
  }

  let htfTrend: HtfTrend | null = null;
  const parentTf = resolveParentTimeframe(timeframe);
  if (parentTf) {
    try {
      const htfCandles = await marketDataService.getCandles(
        symbol,
        parentTf,
        Math.max(INDICATOR_MIN_PERIODS, 250),
      );
      if (htfCandles.length >= 50) {
        htfTrend = detectHtfTrend(computeAllIndicators(htfCandles));
      }
    } catch {
      htfTrend = null;
    }
  }

  const bias = evaluatePositionBias({
    side,
    regime,
    plusDI,
    minusDI,
    htfTrend,
  });

  return {
    positionId: String(position._id),
    tradeId: String(position.tradeId),
    symbol,
    side,
    timeframe,
    regime,
    regimeConfidence,
    htfTrend,
    htfTimeframe: parentTf,
    ...bias,
  };
}

export async function listOpenPositionsMarketContext(
  userId: string,
): Promise<PositionMarketContext[]> {
  const positions = await Position.find({ userId, status: PositionStatus.OPEN }).lean();
  const out: PositionMarketContext[] = [];
  for (const p of positions) {
    try {
      out.push(await getPositionMarketContext(userId, String(p._id)));
    } catch {
      // skip failed symbol
    }
  }
  return out;
}
