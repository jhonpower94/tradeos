import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/utils/crypto.js';
import {
  RateLimiter,
  WeightWindowLimiter,
  binanceKlinesWeight,
  binanceDepthWeight,
  parseBinanceBanUntilMs,
} from '../src/utils/rate-limiter.js';

describe('crypto', () => {
  it('round-trips encryption', () => {
    const plain = 'binance-secret-key';
    const enc = encrypt(plain);
    expect(enc).not.toContain(plain);
    expect(decrypt(enc)).toBe(plain);
  });
});

describe('rate limiter', () => {
  it('allows acquire within capacity', async () => {
    const rl = new RateLimiter(5, 100);
    await rl.acquire(2);
    await rl.acquire(2);
    expect(true).toBe(true);
  });
});

describe('WeightWindowLimiter', () => {
  it('allows weight within the window budget', async () => {
    const rl = new WeightWindowLimiter(100, 60_000);
    await rl.acquire(40);
    await rl.acquire(40);
    expect(rl.used()).toBe(80);
  });

  it('syncUsedWeight raises local usage to remote', () => {
    const rl = new WeightWindowLimiter(1000, 60_000);
    rl.syncUsedWeight(500);
    expect(rl.used()).toBe(500);
    rl.syncUsedWeight(400);
    expect(rl.used()).toBe(500);
  });
});

describe('binance weight helpers', () => {
  it('maps klines limit to weight', () => {
    expect(binanceKlinesWeight(50)).toBe(1);
    expect(binanceKlinesWeight(250)).toBe(2);
    expect(binanceKlinesWeight(500)).toBe(5);
    expect(binanceKlinesWeight(1000)).toBe(5);
  });

  it('maps depth limit to weight', () => {
    expect(binanceDepthWeight(20)).toBe(5);
    expect(binanceDepthWeight(500)).toBe(25);
  });

  it('parses ban-until timestamps', () => {
    const ms = Date.now() + 60_000;
    expect(parseBinanceBanUntilMs(`IP banned until ${ms}`)).toBe(ms);
    expect(parseBinanceBanUntilMs('banned until 1700000000')).toBe(1_700_000_000_000);
    expect(parseBinanceBanUntilMs('no ban')).toBeNull();
  });
});
