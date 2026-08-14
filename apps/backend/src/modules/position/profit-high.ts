/** Min USDT step between profit-high / uPnL-low alerts for a single open trade. */
export const PROFIT_HIGH_MIN_STEP_USDT = 1;

/**
 * Whether this mark should fire a per-trade profit-high notification
 * and what the new peak should be.
 */
export function shouldNotifyProfitHigh(
  upnl: number,
  peakUnrealizedPnl: number,
  minStep = PROFIT_HIGH_MIN_STEP_USDT,
): { notify: boolean; newPeak: number } {
  const peak = peakUnrealizedPnl ?? 0;
  if (upnl > 0 && upnl >= peak + minStep) {
    return { notify: true, newPeak: upnl };
  }
  return { notify: false, newPeak: peak };
}

/**
 * Whether this mark should fire a per-trade uPnL-low notification
 * and what the new trough should be (more negative).
 */
export function shouldNotifyProfitLow(
  upnl: number,
  troughUnrealizedPnl: number,
  minStep = PROFIT_HIGH_MIN_STEP_USDT,
): { notify: boolean; newTrough: number } {
  const trough = troughUnrealizedPnl ?? 0;
  if (upnl < 0 && upnl <= trough - minStep) {
    return { notify: true, newTrough: upnl };
  }
  return { notify: false, newTrough: trough };
}
