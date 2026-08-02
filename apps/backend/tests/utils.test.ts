import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/utils/crypto.js';
import { RateLimiter } from '../src/utils/rate-limiter.js';

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
