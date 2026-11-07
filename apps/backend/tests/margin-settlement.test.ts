import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../src/modules/settings/index.js', () => ({
  getRawSettings: vi.fn(async () => ({
    trading: { mode: 'live', executionVenue: 'margin' },
  })),
  getBinanceCredentials: vi.fn(async () => ({ apiKey: 'k', apiSecret: 's' })),
}));

function makePair(baseBorrowed: number) {
  return {
    symbol: 'INJUSDT',
    base: {
      asset: 'INJ',
      free: 0,
      locked: 0,
      borrowed: baseBorrowed,
      interest: 0,
      netAsset: -baseBorrowed,
    },
    quote: {
      asset: 'USDT',
      free: 2500,
      locked: 0,
      borrowed: 0,
      interest: 0,
      netAsset: 2500,
    },
    marginLevel: baseBorrowed > 0 ? 2.05 : 999,
    liquidatePrice: 0,
    liquidateRate: 0,
    enabled: true,
  };
}

vi.mock('../src/modules/exchange/index.js', async () => {
  const actual = await vi.importActual<typeof import('../src/modules/exchange/index.js')>(
    '../src/modules/exchange/index.js',
  );
  let pair = makePair(18.76);
  return {
    ...actual,
    exchangeService: {
      ...actual.exchangeService,
      setCredentials: vi.fn(),
      getIsolatedMarginAccount: vi.fn(async () => {
        return [{ ...pair, base: { ...pair.base }, quote: { ...pair.quote } }];
      }),
      getBalances: vi.fn(async () => [{ asset: 'USDT', free: 10_000, locked: 0 }]),
      getTicker: vi.fn(async () => ({ symbol: 'INJUSDT', price: 20 })),
      transferIsolatedMargin: vi.fn(async () => undefined),
      repayIsolatedMargin: vi.fn(async () => ({ tranId: 1 })),
      getMaxTransferable: vi.fn(async () => (pair.base.borrowed > 0 ? 0 : 2000)),
      placeMarginOrder: vi.fn(async () => {
        pair = makePair(0);
        return {
          orderId: '1',
          symbol: 'INJUSDT',
          status: 'FILLED',
          side: 'BUY',
          type: 'MARKET',
          price: 20,
          executedQty: 18.76,
          cummulativeQuoteQty: 375,
        };
      }),
      getExchangeInfo: vi.fn(async () => []),
      getLotSize: vi.fn(() => ({ stepSize: 0.01, minQty: 0.01, minNotional: 5 })),
      roundQty: vi.fn((_: string, qty: number) => Math.floor(qty * 100) / 100),
      ceilQty: vi.fn((_: string, qty: number) => Math.ceil(qty * 100) / 100),
      qtyToCoverBorrow: vi.fn((_: string, owed: number, price: number) => {
        let qty = Math.floor(owed * 100) / 100;
        if (qty <= 0 && owed > 0) qty = Math.ceil(owed * 100) / 100;
        if (price > 0 && qty * price < 5) qty = Math.ceil(((5 * 1.02) / price) * 100) / 100;
        return qty;
      }),
    },
  };
});

describe('qtyToCoverBorrow (exchange)', () => {
  it('bumps dust qty up to min notional', async () => {
    const { ExchangeService } = await import('../src/modules/exchange/index.js');
    const svc = new ExchangeService();
    // @ts-expect-error test stub
    svc.symbolCache = [
      {
        symbol: 'INJUSDT',
        baseAsset: 'INJ',
        quoteAsset: 'USDT',
        status: 'TRADING',
        filters: [
          { filterType: 'LOT_SIZE', stepSize: '0.01', minQty: '0.01' },
          { filterType: 'NOTIONAL', minNotional: '5' },
        ],
      },
    ];
    // @ts-expect-error test stub
    svc.symbolCacheAt = Date.now();
    const qty = svc.qtyToCoverBorrow('INJUSDT', 0.05, 20); // $1 notional dust
    expect(qty * 20).toBeGreaterThanOrEqual(5);
  });
});

describe('margin settlement', () => {
  const userId = new Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reconcile clears debt via BUY+AUTO_REPAY then reports sweepable', async () => {
    const { reconcileIsolatedSymbol } = await import('../src/modules/portfolio/margin-settlement.js');
    const result = await reconcileIsolatedSymbol(userId, 'INJUSDT');
    expect(result.status).toBe('sweepable');
    expect(result.actions).toContain('buy_auto_repay');
  });

  it('transfer blocks when debt remains', async () => {
    const { exchangeService } = await import('../src/modules/exchange/index.js');
    vi.mocked(exchangeService.getIsolatedMarginAccount).mockResolvedValueOnce([makePair(5)]);
    const { transferMarginToSpot } = await import('../src/modules/portfolio/margin-settlement.js');
    await expect(transferMarginToSpot(userId, 'INJUSDT')).rejects.toMatchObject({
      code: 'MARGIN_DEBT',
    });
  });
});
