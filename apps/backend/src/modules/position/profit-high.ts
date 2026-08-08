/** Min USDT step between profit-high alerts for a single open trade. */
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
