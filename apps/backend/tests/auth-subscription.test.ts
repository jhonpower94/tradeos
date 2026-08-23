import { describe, it, expect } from 'vitest';
import { classifyPaymentAmount } from '../src/modules/subscription/index.js';
import {
  generateTotpSecret,
  verifyTotp,
  buildOtpAuthUri,
} from '../src/utils/totp.js';
import { createHmac } from 'node:crypto';

describe('classifyPaymentAmount', () => {
  it('treats amounts within tolerance as exact', () => {
    expect(classifyPaymentAmount(29.000123, 29.00012, 0.01)).toBe('exact');
    expect(classifyPaymentAmount(29, 29.005, 0.01)).toBe('exact');
  });

  it('detects under and over payment', () => {
    expect(classifyPaymentAmount(29, 28.5, 0.01)).toBe('under');
    expect(classifyPaymentAmount(29, 30, 0.01)).toBe('over');
  });
});

describe('totp', () => {
  it('generates secret and verifies current code', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(10);
    const otpauth = buildOtpAuthUri({ secret, email: 'a@b.com' });
    expect(otpauth.startsWith('otpauth://totp/')).toBe(true);

    const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleaned = secret.replace(/=+$/, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const c of cleaned) {
      const idx = BASE32.indexOf(c);
      if (idx < 0) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    const key = Buffer.from(bytes);
    const step = BigInt(Math.floor(Date.now() / 1000 / 30));
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(step);
    const hmac = createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1]! & 0xf;
    const code =
      ((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff);
    const token = String(code % 1_000_000).padStart(6, '0');
    expect(verifyTotp(secret, token)).toBe(true);
    expect(verifyTotp(secret, '000000')).toBe(false);
  });
});
