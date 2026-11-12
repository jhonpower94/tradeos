/** Intersect candidate symbols with an allow-set (e.g. isolated-margin USDT pairs). */
export function intersectSymbols(symbols: string[], allow: ReadonlySet<string>): string[] {
  if (allow.size === 0) return symbols;
  return symbols.filter((s) => allow.has(s));
}

export type HotSetTicker = {
  volume24h?: number;
  bid?: number;
  ask?: number;
  price?: number;
};

/**
 * Liquidity + spread filter, sort by 24h volume, take top `hotSize`.
 * Call after any venue eligibility intersect so hotSetSize is preserved among eligible pairs.
 */
export function selectHotSymbols(
  symbols: string[],
  tickerBySymbol: Map<string, HotSetTicker>,
  opts: {
    held?: ReadonlySet<string>;
    minLiquidity: number;
    maxSpreadBps: number;
    hotSize: number;
  },
): string[] {
  const held = opts.held ?? new Set<string>();
  return symbols
    .filter((s) => !held.has(s))
    .map((s) => {
      const t = tickerBySymbol.get(s);
      if (!t || t.volume24h == null || t.bid == null || t.ask == null || !t.price) {
        return null;
      }
      const spreadBps = ((t.ask - t.bid) / t.price) * 10_000;
      if (t.volume24h < opts.minLiquidity || spreadBps > opts.maxSpreadBps) return null;
      return { symbol: s, volume24h: t.volume24h };
    })
    .filter((x): x is { symbol: string; volume24h: number } => x != null)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, opts.hotSize)
    .map((x) => x.symbol);
}
