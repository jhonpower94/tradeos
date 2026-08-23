import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]!;
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]!;
  return out;
}

function base32ToBuffer(secret: string): Buffer {
  const cleaned = secret.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
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
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: bigint, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
}

export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const cleaned = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const key = base32ToBuffer(secret);
  const step = BigInt(Math.floor(Date.now() / 1000 / 30));
  const expected = Buffer.from(cleaned);
  for (let w = -window; w <= window; w++) {
    const code = hotp(key, step + BigInt(w));
    const got = Buffer.from(code);
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}

export function buildOtpAuthUri(opts: {
  secret: string;
  email: string;
  issuer?: string;
}): string {
  const issuerName = opts.issuer ?? 'Trading OS';
  const issuer = encodeURIComponent(issuerName);
  const label = encodeURIComponent(`${issuerName}:${opts.email}`);
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
