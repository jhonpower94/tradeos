import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionVenue } from '@trading-os/shared';

vi.mock('../src/models/Position.js', () => ({
  Position: { find: vi.fn() },
}));

vi.mock('../src/modules/exchange/index.js', () => ({
  exchangeService: {
    getBalances: vi.fn(),
    getIsolatedMarginAccount: vi.fn(),
  },
}));

describe('computeLiveEquityAndRiskBudget', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { Position } = await import('../src/models/Position.js');
    (Position.find as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve([]),
      }),
    });
    const { exchangeService } = await import('../src/modules/exchange/index.js');
    vi.mocked(exchangeService.getBalances).mockResolvedValue([
      { asset: 'USDT', free: 1000, locked: 0 },
    ]);
    vi.mocked(exchangeService.getIsolatedMarginAccount).mockResolvedValue([
      {
        symbol: 'BTCUSDT',
        base: {
          asset: 'BTC',
          free: 0,
          locked: 0,
          borrowed: 0,
          interest: 0,
          netAsset: 0,
        },
        quote: {
          asset: 'USDT',
          free: 2000,
          locked: 0,
          borrowed: 0,
          interest: 0,
          netAsset: 2050,
        },
        marginLevel: 10,
        liquidatePrice: 0,
        liquidateRate: 0,
        enabled: true,
      },
    ]);
  });

  it('margin: equity uses stack + uPnL; riskFreeQuote uses free USDT minus deployed with haircut', async () => {
    const { Position } = await import('../src/models/Position.js');
    (Position.find as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve([
            { qty: 15.25, entryPrice: 100, unrealizedPnl: 10 },
          ]),
      }),
    });
    const {
      computeLiveEquityAndRiskBudget,
      LIVE_RISK_QUOTE_HAIRCUT,
    } = await import('../src/modules/trade/live-equity.js');
    const { equity, riskFreeQuote } = await computeLiveEquityAndRiskBudget(
      'u1' as never,
      ExecutionVenue.MARGIN,
    );
    // equity: spot 1000 + isolated net 2050 + uPnL 10
    expect(equity).toBeCloseTo(3050 + 10, 6);
    // spendable free: spot free 1000 + iso free 2000 - deployed 1525, then haircut
    expect(riskFreeQuote).toBeCloseTo((1000 + 2000 - 1525) * LIVE_RISK_QUOTE_HAIRCUT, 6);
  });

  it('spot: sizes off free USDT (not locked) with haircut', async () => {
    const { exchangeService } = await import('../src/modules/exchange/index.js');
    vi.mocked(exchangeService.getBalances).mockResolvedValue([
      { asset: 'USDT', free: 1500, locked: 500 },
    ]);
    const { Position } = await import('../src/models/Position.js');
    (Position.find as ReturnType<typeof vi.fn>).mockReturnValue({
      select: () => ({
        lean: () =>
          Promise.resolve([{ qty: 1, entryPrice: 500, unrealizedPnl: 0 }]),
      }),
    });
    const {
      computeLiveEquityAndRiskBudget,
      LIVE_RISK_QUOTE_HAIRCUT,
    } = await import('../src/modules/trade/live-equity.js');
    const { equity, riskFreeQuote } = await computeLiveEquityAndRiskBudget(
      'u1' as never,
      ExecutionVenue.SPOT,
    );
    expect(equity).toBe(2000);
    expect(riskFreeQuote).toBeCloseTo((1500 - 500) * LIVE_RISK_QUOTE_HAIRCUT, 6);
  });

  it('margin: falls back to spot when isolated account fetch fails', async () => {
    const { exchangeService } = await import('../src/modules/exchange/index.js');
    vi.mocked(exchangeService.getIsolatedMarginAccount).mockRejectedValue(new Error('network'));
    const {
      computeLiveEquityAndRiskBudget,
      LIVE_RISK_QUOTE_HAIRCUT,
    } = await import('../src/modules/trade/live-equity.js');
    const { equity, riskFreeQuote } = await computeLiveEquityAndRiskBudget(
      'u1' as never,
      ExecutionVenue.MARGIN,
    );
    expect(equity).toBe(1000);
    expect(riskFreeQuote).toBeCloseTo(1000 * LIVE_RISK_QUOTE_HAIRCUT, 6);
  });
});
