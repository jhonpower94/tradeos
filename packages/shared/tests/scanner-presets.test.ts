import { describe, it, expect } from 'vitest';
import { STRATEGY_IDS } from '../src/constants/index.js';
import {
  applyScannerPreset,
  countEarlyPackVoters,
  countEnabledStrategies,
  deriveEntryTiming,
  EARLY_STRATEGY_PACK,
  formatStrategyLabel,
  LAGGING_STRATEGY_PACK,
  OTHER_STRATEGY_PACK,
  strategySinglePatch,
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

describe('OTHER_STRATEGY_PACK', () => {
  it('partitions STRATEGY_IDS into early, lagging, and other with no overlap', () => {
    const early = new Set(EARLY_STRATEGY_PACK);
    const lagging = new Set(LAGGING_STRATEGY_PACK);
    const other = new Set(OTHER_STRATEGY_PACK);
    expect(early.size + lagging.size + other.size).toBe(STRATEGY_IDS.length);
    for (const id of STRATEGY_IDS) {
      const inEarly = early.has(id);
      const inLagging = lagging.has(id);
      const inOther = other.has(id);
      expect(Number(inEarly) + Number(inLagging) + Number(inOther)).toBe(1);
    }
    for (const id of OTHER_STRATEGY_PACK) {
      expect(early.has(id)).toBe(false);
      expect(lagging.has(id)).toBe(false);
    }
  });
});

describe('strategySinglePatch', () => {
  it('returns a single-id strategies patch', () => {
    expect(strategySinglePatch('order_block', true)).toEqual({
      order_block: { enabled: true, params: {} },
    });
    expect(strategySinglePatch('resistance_rejection', false)).toEqual({
      resistance_rejection: { enabled: false, params: {} },
    });
  });
});

describe('countEnabledStrategies', () => {
  it('counts absent ids as enabled and respects explicit false', () => {
    expect(countEnabledStrategies(undefined, ['order_block', 'breakout'])).toBe(2);
    expect(
      countEnabledStrategies(
        { order_block: { enabled: true }, breakout: { enabled: false } },
        ['order_block', 'breakout'],
      ),
    ).toBe(1);
  });
});

describe('formatStrategyLabel', () => {
  it('humanizes snake_case ids', () => {
    expect(formatStrategyLabel('order_block')).toBe('Order block');
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
