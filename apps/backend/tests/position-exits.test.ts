import { describe, it, expect } from 'vitest';
import { Side } from '@trading-os/shared';
import {
  calcRMultiple,
  decideExitManagement,
  DEFAULT_EXIT_MANAGE_SETTINGS,
  type ExitManageSettings,
} from '../src/modules/position/index.js';

const base = {
  side: Side.BUY as Side,
  entry: 100,
  stopLoss: 98,
  initialStopLoss: 98,
  takeProfit: 104, // 2R
  partialTpDone: false,
  trailingStopPct: null as number | null,
  trailingStopPrice: null as number | null,
  settings: DEFAULT_EXIT_MANAGE_SETTINGS,
};

describe('calcRMultiple', () => {
  it('returns +1R when price moved one risk unit in favor (BUY)', () => {
    expect(
      calcRMultiple({
        side: Side.BUY,
        entry: 100,
        price: 102,
        initialStopLoss: 98,
      }),
    ).toBe(1);
  });

  it('uses initialStopLoss after SL moved to breakeven', () => {
    expect(
      calcRMultiple({
        side: Side.BUY,
        entry: 100,
        price: 102,
        initialStopLoss: 98,
        stopLoss: 100,
      }),
    ).toBe(1);
  });

  it('returns positive R for SELL when price drops', () => {
    expect(
      calcRMultiple({
        side: Side.SELL,
        entry: 100,
        price: 98,
        initialStopLoss: 102,
      }),
    ).toBe(1);
  });
});

describe('decideExitManagement', () => {
  it('at +1R with defaults: partial 50%, breakeven, arm trailing 1.5%', () => {
    const d = decideExitManagement({ ...base, price: 102 });
    expect(d).toEqual({
      action: 'partial',
      fraction: 0.5,
      armTrailing: true,
      trailingStopPct: 1.5,
      breakeven: true,
    });
  });

  it('gap through full TP before partial: full close, no partial', () => {
    const d = decideExitManagement({ ...base, price: 104.5 });
    expect(d).toEqual({ action: 'full_close', reason: 'Take profit hit' });
  });

  it('stop loss takes priority', () => {
    const d = decideExitManagement({ ...base, price: 97.5 });
    expect(d).toEqual({ action: 'full_close', reason: 'Stop loss hit' });
  });

  it('partial disabled, trailing on: at +1R arms trail without reducing qty', () => {
    const settings: ExitManageSettings = {
      ...DEFAULT_EXIT_MANAGE_SETTINGS,
      partialTpEnabled: false,
    };
    const d = decideExitManagement({ ...base, price: 102, settings });
    expect(d).toEqual({ action: 'arm_trailing', trailingStopPct: 1.5 });
  });

  it('after partial done, pullback to trail closes fully', () => {
    const d = decideExitManagement({
      ...base,
      price: 101,
      partialTpDone: true,
      trailingStopPct: 1.5,
      trailingStopPrice: 101.5,
      stopLoss: 100,
    });
    expect(d).toEqual({ action: 'full_close', reason: 'Trailing stop hit' });
  });

  it('after partial done below trail and above SL: none', () => {
    const d = decideExitManagement({
      ...base,
      price: 102,
      partialTpDone: true,
      trailingStopPct: 1.5,
      trailingStopPrice: 100.5,
      stopLoss: 100,
    });
    expect(d).toEqual({ action: 'none' });
  });

  it('does not re-partial when already done', () => {
    const d = decideExitManagement({
      ...base,
      price: 102,
      partialTpDone: true,
      trailingStopPct: 1.5,
      trailingStopPrice: 100.4,
    });
    expect(d.action).toBe('none');
  });
});
