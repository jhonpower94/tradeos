import { describe, it, expect } from 'vitest';
import { STRATEGY_IDS } from '@trading-os/shared';
import { strategiesToPlain } from '../src/modules/settings/index.js';

describe('strategiesToPlain', () => {
  it('converts a Map to a plain object with all strategy ids', () => {
    const map = new Map<string, { enabled: boolean; params: object }>([
      ['ema_pullback', { enabled: true, params: {} }],
      ['supertrend', { enabled: false, params: {} }],
    ]);
    const plain = strategiesToPlain(map);
    expect(plain.ema_pullback.enabled).toBe(true);
    expect(plain.supertrend.enabled).toBe(false);
    expect(Object.keys(plain).sort()).toEqual([...STRATEGY_IDS].sort());
  });

  it('preserves disabled flags from a plain object', () => {
    const plain = strategiesToPlain({
      macd_momentum: { enabled: false, params: {} },
    });
    expect(plain.macd_momentum.enabled).toBe(false);
    expect(plain.ema_pullback.enabled).toBe(true);
  });

  it('does not serialize like JSON.stringify(Map) → {}', () => {
    const map = new Map([['ema_cross', { enabled: false, params: {} }]]);
    expect(JSON.stringify(map)).toBe('{}');
    expect(JSON.parse(JSON.stringify(strategiesToPlain(map))).ema_cross.enabled).toBe(false);
  });
});
