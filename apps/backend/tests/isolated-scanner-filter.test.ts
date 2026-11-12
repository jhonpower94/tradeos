import { describe, it, expect } from 'vitest';
import { isolatedUsdtSymbolsFromPairs } from '../src/modules/exchange/index.js';
import { intersectSymbols, selectHotSymbols } from '../src/modules/scanner/universe.js';

describe('isolatedUsdtSymbolsFromPairs', () => {
  it('keeps only USDT pairs with isMarginTrade true', () => {
    const symbols = isolatedUsdtSymbolsFromPairs([
      { symbol: 'BTCUSDT', quote: 'USDT', isMarginTrade: true },
      { symbol: 'ETHBTC', quote: 'BTC', isMarginTrade: true },
      { symbol: 'ETHUSDT', quote: 'USDT', isMarginTrade: false },
      { symbol: 'NBISBUSDT', quote: 'USDT', isMarginTrade: false },
      { symbol: 'SOLUSDT', quote: 'USDT', isMarginTrade: true },
      { quote: 'USDT', isMarginTrade: true },
    ]);
    expect(symbols).toEqual(['BTCUSDT', 'SOLUSDT']);
  });
});

describe('intersectSymbols + selectHotSymbols', () => {
  it('excludes non-isolated symbols like NBISBUSDT and keeps BTCUSDT', () => {
    const spot = ['BTCUSDT', 'NBISBUSDT', 'SPCXBUSDT', 'ETHUSDT', 'SOLUSDT'];
    const isolated = new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
    expect(intersectSymbols(spot, isolated)).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  });

  it('preserves hotSetSize after isolated intersect when enough liquid pairs exist', () => {
    const hotSize = 5;
    const candidates = Array.from({ length: 20 }, (_, i) => `S${i}USDT`);
    // Isolated allow-list drops odd indices (stock-token style exclusions).
    const isolated = new Set(candidates.filter((_, i) => i % 2 === 0));
    const eligible = intersectSymbols(candidates, isolated);
    expect(eligible).toHaveLength(10);

    const tickerBySymbol = new Map(
      eligible.map((symbol, i) => [
        symbol,
        {
          volume24h: 10_000_000 - i * 100_000,
          bid: 100,
          ask: 100.05,
          price: 100,
        },
      ]),
    );

    const hot = selectHotSymbols(eligible, tickerBySymbol, {
      minLiquidity: 1_000_000,
      maxSpreadBps: 20,
      hotSize,
    });

    expect(hot).toHaveLength(hotSize);
    expect(hot[0]).toBe('S0USDT');
    expect(hot).not.toContain('S1USDT');
  });

  it('does not shrink hot set when allow-set is empty (filter skipped)', () => {
    const symbols = ['BTCUSDT', 'NBISBUSDT', 'ETHUSDT'];
    expect(intersectSymbols(symbols, new Set())).toEqual(symbols);
  });
});
