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
      getMaxTransferable: vi.fn(async (asset: string) => {
        if (pair.base.borrowed > 0 || pair.quote.borrowed > 0) return 0;
        const a = asset.toUpperCase();
        if (a === 'USDT') return Math.max(0, pair.quote.free);
        if (a === pair.base.asset.toUpperCase()) return Math.max(0, pair.base.free);
        return 0;
      }),
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
      placeOrder: vi.fn(async () => ({
        orderId: '3',
        symbol: 'INJUSDT',
        status: 'FILLED',
        side: 'SELL',
        type: 'MARKET',
        price: 20,
        executedQty: 0,
        cummulativeQuoteQty: 0,
      })),
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

  it('settle converts free base then sweeps USDT', async () => {
    const { exchangeService } = await import('../src/modules/exchange/index.js');
    const clear = makePair(0);
    // 0.5 INJ @ $20 = $10 >= min notional $5 → sellable
    clear.base.free = 0.5;
    clear.base.netAsset = 0.5;
    clear.quote.free = 100;
    clear.quote.netAsset = 100;

    let usdtLeft = 100;
    let injLeft = 0.5;
    vi.mocked(exchangeService.getIsolatedMarginAccount).mockImplementation(async () => [
      {
        ...clear,
        base: { ...clear.base, free: injLeft, netAsset: injLeft },
        quote: { ...clear.quote, free: usdtLeft, netAsset: usdtLeft },
      },
    ]);
    vi.mocked(exchangeService.getMaxTransferable).mockImplementation(async (asset: string) => {
      const a = asset.toUpperCase();
      if (a === 'USDT') return usdtLeft;
      if (a === 'INJ') return injLeft;
      return 0;
    });
    vi.mocked(exchangeService.placeMarginOrder).mockImplementation(async (params) => {
      if (params.side === 'SELL') {
        const px = 20;
        const qty = Number(params.quantity);
        injLeft = Math.max(0, injLeft - qty);
        usdtLeft += qty * px;
      }
      return {
        orderId: '2',
        symbol: 'INJUSDT',
        status: 'FILLED',
        side: String(params.side),
        type: 'MARKET',
        price: 20,
        executedQty: Number(params.quantity),
        cummulativeQuoteQty: Number(params.quantity) * 20,
      };
    });
    vi.mocked(exchangeService.transferIsolatedMargin).mockImplementation(async (input) => {
      const a = String(input.asset).toUpperCase();
      if (a === 'USDT') usdtLeft = Math.max(0, usdtLeft - Number(input.amount));
      if (a === 'INJ') injLeft = Math.max(0, injLeft - Number(input.amount));
    });

    const { settleMarginWallet } = await import('../src/modules/portfolio/margin-settlement.js');
    const result = await settleMarginWallet(userId, 'INJUSDT');

    expect(result.actions).toContain('convert_base');
    expect(result.actions.some((a) => a === 'transfer' || a === 'transfer_usdt')).toBe(true);
    expect(result.soldQty).toBe(0.5);
    expect(result.transferAmount).toBe(110); // 100 + 0.5*20
    expect(result.baseTransferAmount).toBe(0);
    expect(exchangeService.placeMarginOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        side: 'SELL',
        type: 'MARKET',
        quantity: 0.5,
        sideEffectType: 'NO_SIDE_EFFECT',
      }),
    );
    expect(exchangeService.transferIsolatedMargin).toHaveBeenCalledWith(
      expect.objectContaining({ asset: 'USDT', amount: 110, direction: 'to_spot' }),
    );
  });

  it('settle transfers dust base when below min notional', async () => {
    const { exchangeService } = await import('../src/modules/exchange/index.js');
    const clear = makePair(0);
    // 0.15 INJ @ $20 = $3 < min notional $5 → unsellable dust
    clear.base.free = 0.15;
    clear.base.netAsset = 0.15;
    clear.quote.free = 100;
    clear.quote.netAsset = 100;

    let usdtLeft = 100;
    let injLeft = 0.15;
    let spotInj = 0;
    vi.mocked(exchangeService.getIsolatedMarginAccount).mockResolvedValue([clear]);
    vi.mocked(exchangeService.getMaxTransferable).mockImplementation(async (asset: string) => {
      const a = asset.toUpperCase();
      if (a === 'USDT') return usdtLeft;
      if (a === 'INJ') return injLeft;
      return 0;
    });
    vi.mocked(exchangeService.transferIsolatedMargin).mockImplementation(async (input) => {
      const a = String(input.asset).toUpperCase();
      if (a === 'USDT') usdtLeft = Math.max(0, usdtLeft - Number(input.amount));
      if (a === 'INJ') {
        injLeft = Math.max(0, injLeft - Number(input.amount));
        spotInj += Number(input.amount);
      }
    });
    vi.mocked(exchangeService.getBalances).mockImplementation(async () => [
      { asset: 'USDT', free: usdtLeft + 10_000, locked: 0 },
      { asset: 'INJ', free: spotInj, locked: 0 },
    ]);

    const { settleMarginWallet } = await import('../src/modules/portfolio/margin-settlement.js');
    const result = await settleMarginWallet(userId, 'INJUSDT');

    expect(result.actions).not.toContain('convert_base');
    expect(result.actions).not.toContain('convert_spot_base');
    expect(result.soldQty).toBe(0);
    expect(result.actions).toEqual(expect.arrayContaining(['transfer_usdt', 'transfer_base']));
    expect(result.baseTransferAmount).toBe(0.15);
    expect(result.convertSkipped).toMatch(/min notional/i);
    expect(exchangeService.placeMarginOrder).not.toHaveBeenCalled();
    expect(exchangeService.placeOrder).not.toHaveBeenCalled();
  });

  it('settle converts on spot after transferring sellable base', async () => {
    const { exchangeService } = await import('../src/modules/exchange/index.js');
    const clear = makePair(0);
    // Soft-skip isolated (force via getLotSize), then spot sell after transfer.
    clear.base.free = 0.5;
    clear.base.netAsset = 0.5;
    clear.quote.free = 50;
    clear.quote.netAsset = 50;

    let usdtIso = 50;
    let injIso = 0.5;
    let spotInj = 0;
    let spotUsdt = 0;
    vi.mocked(exchangeService.getLotSize).mockReturnValue({
      stepSize: 0.01,
      minQty: 0.01,
      minNotional: 20, // isolated soft-skip: 0.5*20=10 < 20*0.9
    });
    vi.mocked(exchangeService.getIsolatedMarginAccount).mockImplementation(async () => [
      {
        ...clear,
        base: { ...clear.base, free: injIso, netAsset: injIso },
        quote: { ...clear.quote, free: usdtIso, netAsset: usdtIso },
      },
    ]);
    vi.mocked(exchangeService.getMaxTransferable).mockImplementation(async (asset: string) => {
      const a = asset.toUpperCase();
      if (a === 'USDT') return usdtIso;
      if (a === 'INJ') return injIso;
      return 0;
    });
    vi.mocked(exchangeService.transferIsolatedMargin).mockImplementation(async (input) => {
      const a = String(input.asset).toUpperCase();
      if (a === 'USDT') usdtIso = Math.max(0, usdtIso - Number(input.amount));
      if (a === 'INJ') {
        injIso = Math.max(0, injIso - Number(input.amount));
        spotInj += Number(input.amount);
      }
    });
    vi.mocked(exchangeService.getBalances).mockImplementation(async () => [
      { asset: 'USDT', free: spotUsdt, locked: 0 },
      { asset: 'INJ', free: spotInj, locked: 0 },
    ]);
    // Spot path uses a lower min notional so convert can succeed after transfer.
    vi.mocked(exchangeService.getLotSize)
      .mockReturnValueOnce({ stepSize: 0.01, minQty: 0.01, minNotional: 20 }) // isolated size
      .mockReturnValue({ stepSize: 0.01, minQty: 0.01, minNotional: 5 }); // spot size
    vi.mocked(exchangeService.placeOrder).mockImplementation(async (params) => {
      const qty = Number(params.quantity);
      spotInj = Math.max(0, spotInj - qty);
      spotUsdt += qty * 20;
      return {
        orderId: '9',
        symbol: 'INJUSDT',
        status: 'FILLED',
        side: 'SELL',
        type: 'MARKET',
        price: 20,
        executedQty: qty,
        cummulativeQuoteQty: qty * 20,
      };
    });

    const { settleMarginWallet } = await import('../src/modules/portfolio/margin-settlement.js');
    const result = await settleMarginWallet(userId, 'INJUSDT');

    expect(result.actions).not.toContain('convert_base');
    expect(result.actions).toContain('convert_spot_base');
    expect(result.soldQty).toBe(0.5);
    expect(result.convertSkipped).toBeUndefined();
    expect(exchangeService.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'SELL', quantity: 0.5 }),
    );
  });

  it('transfer sweeps base without converting', async () => {
    const { exchangeService } = await import('../src/modules/exchange/index.js');
    const clear = makePair(0);
    clear.base.free = 0.2;
    clear.base.netAsset = 0.2;
    clear.quote.free = 0;
    clear.quote.netAsset = 0;

    vi.mocked(exchangeService.getIsolatedMarginAccount).mockResolvedValue([clear]);
    vi.mocked(exchangeService.getMaxTransferable).mockImplementation(async (asset: string) => {
      const a = asset.toUpperCase();
      if (a === 'USDT') return 0;
      if (a === 'INJ') return 0.2;
      return 0;
    });

    const { transferMarginToSpot } = await import('../src/modules/portfolio/margin-settlement.js');
    const result = await transferMarginToSpot(userId, 'INJUSDT');
    expect(result.actions).toContain('transfer_base');
    expect(result.baseTransferAmount).toBe(0.2);
    expect(result.amount).toBe(0);
    expect(exchangeService.placeMarginOrder).not.toHaveBeenCalled();
    expect(exchangeService.transferIsolatedMargin).toHaveBeenCalledWith(
      expect.objectContaining({ asset: 'INJ', amount: 0.2, direction: 'to_spot' }),
    );
  });
});
