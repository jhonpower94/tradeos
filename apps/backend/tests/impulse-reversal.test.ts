import { describe, expect, it } from 'vitest';
import { Decision, type Candle } from '@trading-os/shared';
import { impulseReversalStrategy } from '../src/modules/strategies/builtin/impulse-reversal.js';
import { resistanceRejectionStrategy } from '../src/modules/strategies/builtin/resistance-rejection.js';
import { supportBounceStrategy } from '../src/modules/strategies/builtin/support-bounce.js';
import { computeAllIndicators } from '../src/modules/indicators/index.js';
import { detectPatterns } from '../src/modules/patterns/index.js';
import {
  isAlreadyExtended,
  isLargeImpulse,
  isStillNearExtreme,
  measureImpulse,
} from '../src/modules/strategies/utils.js';

function candle(
  i: number,
  open: number,
  high: number,
  low: number,
  close: number,
): Candle {
  return {
    openTime: i * 60_000,
    open,
    high,
    low,
    close,
    volume: 1000,
    closeTime: i * 60_000 + 59_999,
  };
}

/** Steady rally from ~100 → ~112, then optional final candle override. */
function rallyThen(
  last: { open: number; high: number; low: number; close: number },
): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 39; i++) {
    const p = 100 + i * 0.3; // ~111.4 at i=38
    out.push(candle(i, p - 0.05, p + 0.15, p - 0.15, p));
  }
  out.push(candle(39, last.open, last.high, last.low, last.close));
  return out;
}

/** Steady selloff from ~112 → ~100, then optional final candle. */
function selloffThen(
  last: { open: number; high: number; low: number; close: number },
): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < 39; i++) {
    const p = 112 - i * 0.3; // ~100.4 at i=38
    out.push(candle(i, p + 0.05, p + 0.15, p - 0.15, p));
  }
  out.push(candle(39, last.open, last.high, last.low, last.close));
  return out;
}

/** Flat ~100 range — too small for impulse_reversal. */
function flatRange(n = 40): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const p = 100 + Math.sin(i / 3) * 0.4;
    out.push(candle(i, p - 0.05, p + 0.1, p - 0.1, p));
  }
  return out;
}

function evalImpulse(candles: Candle[]) {
  const indicators = computeAllIndicators(candles);
  return impulseReversalStrategy.evaluate({
    symbol: 'TESTUSDT',
    timeframe: '1h',
    candles,
    indicators,
    patterns: [],
  });
}

describe('measureImpulse helpers', () => {
  it('detects up-impulse when high is more recent than low', () => {
    const candles = rallyThen({ open: 111.5, high: 112, low: 111, close: 111.2 });
    const atr = 0.8;
    const prior = candles.slice(0, -1);
    const m = measureImpulse(prior, 40, atr)!;
    expect(m.direction).toBe('up');
    expect(isLargeImpulse(m, atr, 111)).toBe(true);
    expect(isStillNearExtreme('sell', 111.2, m.high, atr)).toBe(true);
  });

  it('flags already-extended moves past atr/pct caps', () => {
    expect(isAlreadyExtended('sell', 100, 110, 1)).toBe(true); // 10 ATR / ~9%
    expect(isAlreadyExtended('sell', 109.5, 110, 1)).toBe(false);
    expect(isAlreadyExtended('buy', 110, 100, 1)).toBe(true);
    expect(isAlreadyExtended('buy', 100.5, 100, 1)).toBe(false);
  });
});

describe('impulse_reversal', () => {
  it('SELLS after a large up-impulse with an early bearish rejection', () => {
    // Prior ends ~111.4; signal tags slightly above then rejects (small ATR from smooth trend)
    const candles = rallyThen({
      open: 111.35,
      high: 111.55,
      low: 111.15,
      close: 111.2,
    });
    const res = evalImpulse(candles);
    expect(res.decision).toBe(Decision.SELL);
    expect(res.confidence).toBeGreaterThan(50);
    expect(res.entry).toBeDefined();
    expect(res.stopLoss).toBeGreaterThan(res.entry!);
  });

  it('BUYS after a large down-impulse with an early bullish rejection', () => {
    const candles = selloffThen({
      open: 100.55,
      high: 100.75,
      low: 100.35,
      close: 100.7,
    });
    const res = evalImpulse(candles);
    expect(res.decision).toBe(Decision.BUY);
    expect(res.confidence).toBeGreaterThan(50);
    expect(res.entry).toBeDefined();
    expect(res.stopLoss).toBeLessThan(res.entry!);
  });

  it('NO_TRADE when the rally already pulled back deeply', () => {
    // Build rally then drop far below high inside lookback
    const out: Candle[] = [];
    for (let i = 0; i < 25; i++) {
      const p = 100 + i * 0.5; // peak ~112
      out.push(candle(i, p - 0.05, p + 0.1, p - 0.1, p));
    }
    for (let i = 25; i < 40; i++) {
      const p = 112 - (i - 24) * 0.7; // drop toward ~101
      out.push(candle(i, p + 0.1, p + 0.2, p - 0.2, p));
    }
    // final bearish rejection near local high of the pullback — still deep vs impulse high
    const lastP = out[out.length - 1]!.close;
    out[out.length - 1] = candle(39, lastP + 0.2, lastP + 0.8, lastP - 0.1, lastP - 0.1);
    const res = evalImpulse(out);
    expect(res.decision).toBe(Decision.NO_TRADE);
  });

  it('NO_TRADE when the impulse is too small', () => {
    const candles = flatRange(40);
    const last = candles[candles.length - 1]!;
    last.open = last.close + 0.05;
    last.high = last.close + 0.4;
    last.low = last.close - 0.05;
    last.close = last.close - 0.05;
    const res = evalImpulse(candles);
    expect(res.decision).toBe(Decision.NO_TRADE);
  });
});

describe('RR/SB anti-extension filters', () => {
  it('resistance_rejection skips SELL when already extended below lookback high', () => {
    const out: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      const p = 100 + i * 0.6;
      out.push(candle(i, p - 0.1, p + 0.2, p - 0.2, p));
    }
    // cascade down
    for (let i = 20; i < 39; i++) {
      const p = 112 - (i - 19) * 0.8;
      out.push(candle(i, p + 0.2, p + 0.3, p - 0.3, p));
    }
    // local bearish rejection that would otherwise look like RR
    const p = out[out.length - 1]!.close;
    out.push(candle(39, p + 0.3, p + 1.0, p - 0.1, p - 0.2));

    const indicators = computeAllIndicators(out);
    const patterns = detectPatterns(out, indicators);
    // Inject a nearby resistance so the level gate can pass if extension did not fire
    patterns.push({
      type: 'resistance',
      bullish: false,
      confidence: 70,
      price: out[out.length - 1]!.high * 0.999,
    });

    const res = resistanceRejectionStrategy.evaluate({
      symbol: 'TESTUSDT',
      timeframe: '1h',
      candles: out,
      indicators,
      patterns,
    });
    expect(res.decision).toBe(Decision.NO_TRADE);
    expect(res.evidence.some((e) => /extended/i.test(e.label))).toBe(true);
  });

  it('support_bounce skips BUY when already extended above lookback low', () => {
    const out: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      const p = 112 - i * 0.6;
      out.push(candle(i, p + 0.1, p + 0.2, p - 0.2, p));
    }
    for (let i = 20; i < 39; i++) {
      const p = 100 + (i - 19) * 0.8;
      out.push(candle(i, p - 0.2, p + 0.3, p - 0.3, p));
    }
    const p = out[out.length - 1]!.close;
    out.push(candle(39, p - 0.3, p + 0.1, p - 1.0, p + 0.2));

    const indicators = computeAllIndicators(out);
    const patterns = detectPatterns(out, indicators);
    patterns.push({
      type: 'support',
      bullish: true,
      confidence: 70,
      price: out[out.length - 1]!.low * 1.001,
    });

    const res = supportBounceStrategy.evaluate({
      symbol: 'TESTUSDT',
      timeframe: '1h',
      candles: out,
      indicators,
      patterns,
    });
    expect(res.decision).toBe(Decision.NO_TRADE);
    expect(res.evidence.some((e) => /extended/i.test(e.label))).toBe(true);
  });
});
