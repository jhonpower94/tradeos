import { describe, it, expect } from 'vitest';
import { STRATEGY_IDS } from '../src/constants/index.js';
import {
  applyScannerPreset,
  countEarlyPackVoters,
  deriveEntryTiming,
  EARLY_STRATEGY_PACK,
  LAGGING_STRATEGY_PACK,
} from '../src/constants/scanner-presets.js';

describe('applyScannerPreset', () => {
  it('applies Confirmed gates and enables all strategies including lagging', () => {
    const payload = applyScannerPreset('confirmed');
    expect(payload.scanner).toEqual({
      entryStyle: 'confirmed',
      minAlignedStrategies: 2,
      minConfidence: 75,
      minAgreementRatio: 0.6,
      htfVetoEnabled: true,
    });
    expect(Object.keys(payload.strategies).sort()).toEqual([...STRATEGY_IDS].sort());
    for (const id of LAGGING_STRATEGY_PACK) {
      expect(payload.strategies[id].enabled).toBe(true);
    }
    for (const id of EARLY_STRATEGY_PACK) {
      expect(payload.strategies[id].enabled).toBe(true);
    }
  });

  it('applies Early gates, keeps early pack on, and disables lagging pack', () => {
    const payload = applyScannerPreset('early');
    expect(payload.scanner).toEqual({
      entryStyle: 'early',
      minAlignedStrategies: 1,
      minConfidence: 68,
      minAgreementRatio: 0.55,
      htfVetoEnabled: true,
    });
    for (const id of EARLY_STRATEGY_PACK) {
      expect(payload.strategies[id].enabled).toBe(true);
    }
    for (const id of LAGGING_STRATEGY_PACK) {
      expect(payload.strategies[id].enabled).toBe(false);
    }
    for (const id of STRATEGY_IDS) {
      if (
        !(LAGGING_STRATEGY_PACK as readonly string[]).includes(id) &&
        !(EARLY_STRATEGY_PACK as readonly string[]).includes(id)
      ) {
        expect(payload.strategies[id].enabled).toBe(true);
      }
    }
  });
});

describe('deriveEntryTiming', () => {
  it('returns early for early-pack-only voters', () => {
    expect(deriveEntryTiming(['ema_pullback', 'adx_ignition'])).toBe('early');
  });

  it('returns confirmed for lagging-pack-only voters', () => {
    expect(deriveEntryTiming(['supertrend', 'ema_cross'])).toBe('confirmed');
  });

  it('returns mixed when both packs voted', () => {
    expect(deriveEntryTiming(['ema_pullback', 'macd_momentum'])).toBe('mixed');
  });

  it('returns confirmed when neither pack voted', () => {
    expect(deriveEntryTiming(['breakout'])).toBe('confirmed');
    expect(deriveEntryTiming([])).toBe('confirmed');
  });
});

describe('countEarlyPackVoters', () => {
  it('counts only early-pack strategy ids', () => {
    expect(countEarlyPackVoters(['ema_pullback', 'supertrend', 'order_block'])).toBe(2);
  });
});
