/** Open-trade display: banked realized + live unrealized on remaining size. */
export function openTradeDisplayPnl(
  realizedPnl: number | undefined,
  unrealizedPnl: number | undefined,
): number {
  return (Number(realizedPnl) || 0) + (Number(unrealizedPnl) || 0);
}

export function positionByTradeId(
  positions: Array<Record<string, unknown>> | undefined,
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const p of positions ?? []) {
    if (p.tradeId != null) map.set(String(p.tradeId), p);
  }
  return map;
}
