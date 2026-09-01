import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Side, Timeframe, TradeStatus } from '@trading-os/shared';

const analyzeUserSymbol = vi.fn();
const findTrade = vi.fn();
const countDocuments = vi.fn();
const getRawSettings = vi.fn();

vi.mock('../src/models/Trade.js', () => ({
  Trade: { findOne: (...args: unknown[]) => findTrade(...args) },
}));

vi.mock('../src/models/Position.js', () => ({
  Position: { countDocuments: (...args: unknown[]) => countDocuments(...args) },
}));

vi.mock('../src/modules/settings/index.js', () => ({
  getRawSettings: (...args: unknown[]) => getRawSettings(...args),
  getBinanceCredentials: vi.fn(),
}));

vi.mock('../src/modules/scanner/index.js', () => ({
  scannerService: {
    analyzeUserSymbol: (...args: unknown[]) => analyzeUserSymbol(...args),
  },
}));

describe('copyTrade slots-full rescan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRawSettings.mockResolvedValue({ risk: { maxOpenPositions: 2 } });
    countDocuments.mockResolvedValue(2);
    findTrade.mockReturnValue({
      lean: async () => ({
        _id: 'trade1',
        userId: 'user1',
        symbol: 'BTCUSDT',
        side: Side.BUY,
        entryPrice: 100,
        stopLoss: 95,
        takeProfit: 110,
      }),
    });
    analyzeUserSymbol.mockResolvedValue([
      {
        symbol: 'BTCUSDT',
        side: Side.BUY,
        timeframe: Timeframe.H1,
        confidence: 80,
        entry: 101,
        stopLoss: 96,
        takeProfit: 112,
        riskReward: 2,
        primaryStrategy: 'breakout',
      },
    ]);
  });

  it('rescans the symbol and does not open a trade when slots are full', async () => {
    const { copyTrade } = await import('../src/modules/trade/index.js');
    const result = await copyTrade('user1', 'trade1');

    expect(analyzeUserSymbol).toHaveBeenCalledWith('user1', 'BTCUSDT');
    expect(result).toMatchObject({
      mode: 'rescan',
      symbol: 'BTCUSDT',
      count: 1,
    });
    expect(result).not.toHaveProperty('trade');
    expect((result as { opportunities: unknown[] }).opportunities).toHaveLength(1);
  });

  it('returns empty opportunities when rescan finds nothing', async () => {
    analyzeUserSymbol.mockResolvedValue([]);
    const { copyTrade } = await import('../src/modules/trade/index.js');
    const result = await copyTrade('user1', 'trade1');

    expect(result).toEqual({
      mode: 'rescan',
      symbol: 'BTCUSDT',
      count: 0,
      opportunities: [],
    });
  });

  it('rescans closed winners even when slots remain', async () => {
    countDocuments.mockResolvedValue(0);
    findTrade.mockReturnValue({
      lean: async () => ({
        _id: 'trade1',
        userId: 'user1',
        symbol: 'ETHUSDT',
        side: Side.BUY,
        status: TradeStatus.CLOSED,
        realizedPnl: 42.5,
        entryPrice: 3000,
        stopLoss: 2900,
        takeProfit: 3200,
      }),
    });

    const { copyTrade } = await import('../src/modules/trade/index.js');
    const result = await copyTrade('user1', 'trade1');

    expect(analyzeUserSymbol).toHaveBeenCalledWith('user1', 'ETHUSDT');
    expect(result).toMatchObject({ mode: 'rescan', symbol: 'ETHUSDT' });
    expect(result).not.toHaveProperty('trade');
  });
});
