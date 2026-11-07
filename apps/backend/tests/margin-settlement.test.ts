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
      roundQty: actual.exchangeService.roundQty.bind(actual.exchangeService),
    },
  };
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
