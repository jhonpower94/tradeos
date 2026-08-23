
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/modules/exchange/index.js', async () => {
  const actual = await vi.importActual<typeof import('../src/modules/exchange/index.js')>(
    '../src/modules/exchange/index.js',
  );
  return {
    ...actual,
    exchangeService: {
      ...actual.exchangeService,
      setCredentials: vi.fn(),
      ensureIsolatedAccount: vi.fn(async () => undefined),
      getIsolatedMarginAccount: vi.fn(async () => [
        {
          symbol: 'BTCUSDT',
          base: { asset: 'BTC', free: 0, locked: 0, borrowed: 0, interest: 0, netAsset: 0 },
          quote: { asset: 'USDT', free: 5000, locked: 0, borrowed: 0, interest: 0, netAsset: 5000 },
          marginLevel: 999,
          liquidatePrice: 0,
          liquidateRate: 0,
          enabled: true,
        },
      ]),
      transferIsolatedMargin: vi.fn(async () => undefined),
      getBalances: vi.fn(async () => [{ asset: 'USDT', free: 10_000, locked: 0 }]),
      getTicker: vi.fn(async () => ({ symbol: 'BTCUSDT', price: 100 })),
      placeOrder: vi.fn(),
      placeMarginOrder: vi.fn(async (params: { side: string; sideEffectType?: string }) => ({
        orderId: '1',
        symbol: 'BTCUSDT',
        status: 'FILLED',
        side: params.side,
        type: 'MARKET',
        price: 100,
        executedQty: 1,
        cummulativeQuoteQty: 100,
        sideEffectType: params.sideEffectType,
      })),
      getMarginSizingQuote: vi.fn(async () => ({
        spotFree: 10_000,
        isolatedFree: 5000,
        freeQuote: 15_000,
      })),
    },
  };
});

describe('margin side effects (unit smoke)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('placeMarginOrder is callable with AUTO_BORROW_REPAY for shorts', async () => {
    const { exchangeService } = await import('../src/modules/exchange/index.js');
    const order = await exchangeService.placeMarginOrder({
      symbol: 'BTCUSDT',
      side: 'SELL',
      type: 'MARKET',
      quantity: 0.01,
      sideEffectType: 'AUTO_BORROW_REPAY',
    });
    expect(order.orderId).toBe('1');
    expect(exchangeService.placeMarginOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'SELL', sideEffectType: 'AUTO_BORROW_REPAY' }),
    );
  });
});
