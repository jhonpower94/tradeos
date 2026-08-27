import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { registerSchema, loginSchema, STRATEGY_IDS, Timeframe, TradingMode, applyScannerPreset } from '@trading-os/shared';
import { User, type UserDoc } from '../../models/User.js';
import { AuthToken } from '../../models/AuthToken.js';
import { Settings } from '../../models/Settings.js';
import { AppError } from '../../utils/errors.js';
import { config } from '../../config/index.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { sendAuthMail } from '../../utils/auth-mail.js';
import { buildOtpAuthUri, generateTotpSecret, verifyTotp } from '../../utils/totp.js';
import { getSubscriptionStatus } from '../subscription/entitlement.js';

function parseDurationMs(value: string): number {
  const m = /^(\d+)([smhd])$/i.exec(value.trim());
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  return n * (unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function assertActive(user: UserDoc) {
  if (user.status === 'disabled') {
    throw new AppError('ACCOUNT_DISABLED', 'Account is disabled', 403);
  }
}

async function maybeBootstrapAdmin(user: UserDoc): Promise<UserDoc> {
  const email = config.bootstrapAdminEmail;
  if (!email || user.email.toLowerCase() !== email) return user;
  if (user.role === 'admin') return user;
  user.role = 'admin';
  await user.save();
  return user;
}

export function publicUser(
  user: UserDoc,
  subscription?: Awaited<ReturnType<typeof getSubscriptionStatus>> | null,
) {
  return {
    id: String(user._id),
    email: user.email,
    role: (user.role ?? 'user') as 'user' | 'admin',
    totpEnabled: Boolean(user.totpEnabled),
    subscription: subscription ?? null,
  };
}

export async function registerUser(email: string, password: string) {
  const parsed = registerSchema.parse({ email, password });
  const existing = await User.findOne({ email: parsed.email });
  if (existing) throw new AppError('EMAIL_EXISTS', 'Email already registered', 409);
  const passwordHash = await argon2.hash(parsed.password);
  let user = await User.create({ email: parsed.email, passwordHash });
  user = await maybeBootstrapAdmin(user);
  const early = applyScannerPreset('early');
  const strategies: Record<string, { enabled: boolean; params: object }> = {};
  for (const id of STRATEGY_IDS) strategies[id] = { enabled: true, params: {} };
  await Settings.create({
    userId: user._id,
    onboarding: { tradingPathChosen: false },
    trading: { mode: TradingMode.PAPER, paperStartingBalance: 2100 },
    risk: { maxRiskPerTrade: 0.05, maxOpenPositions: 2 },
    scanner: {
      ...early.scanner,
      timeframes: [Timeframe.H1, Timeframe.H4],
    },
    strategies,
  });
  return user;
}

export async function loginUser(email: string, password: string) {
  const parsed = loginSchema.parse({ email, password });
  let user = await User.findOne({ email: parsed.email });
  if (!user) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  assertActive(user);
  const ok = await argon2.verify(user.passwordHash, parsed.password);
  if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  return maybeBootstrapAdmin(user);
}

export function getUserId(req: FastifyRequest): string {
  const id = (req.user as { sub?: string } | undefined)?.sub;
  if (!id) throw new AppError('UNAUTHORIZED', 'Unauthorized', 401);
  return id;
}

export async function requireAdmin(req: FastifyRequest): Promise<string> {
  await req.jwtVerify();
  const userId = getUserId(req);
  const user = await User.findById(userId);
  if (!user || user.role !== 'admin' || user.status === 'disabled') {
    throw new AppError('FORBIDDEN', 'Admin access required', 403);
  }
  return userId;
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const secret = randomBytes(32).toString('hex');
  const hash = await argon2.hash(secret);
  const expiresAt = new Date(Date.now() + parseDurationMs(config.jwtRefreshExpires));
  await User.findByIdAndUpdate(userId, {
    refreshTokenHash: hash,
    refreshTokenExpiresAt: expiresAt,
  });
  return `${userId}.${secret}`;
}

export async function rotateRefreshToken(refreshToken: string): Promise<{
  user: UserDoc;
  refreshToken: string;
}> {
  const dot = refreshToken.indexOf('.');
  if (dot <= 0) throw new AppError('UNAUTHORIZED', 'Invalid refresh token', 401);
  const userId = refreshToken.slice(0, dot);
  const secret = refreshToken.slice(dot + 1);
  if (!secret) throw new AppError('UNAUTHORIZED', 'Invalid refresh token', 401);

  const user = await User.findById(userId);
  if (!user?.refreshTokenHash) throw new AppError('UNAUTHORIZED', 'Invalid refresh token', 401);
  assertActive(user);
  if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt.getTime() < Date.now()) {
    user.refreshTokenHash = undefined;
    user.refreshTokenExpiresAt = undefined;
    await user.save();
    throw new AppError('UNAUTHORIZED', 'Refresh token expired', 401);
  }
  const ok = await argon2.verify(user.refreshTokenHash, secret);
  if (!ok) throw new AppError('UNAUTHORIZED', 'Invalid refresh token', 401);
  const next = await issueRefreshToken(String(user._id));
  return { user, refreshToken: next };
}

export async function clearRefreshToken(userId?: string, refreshToken?: string) {
  if (userId) {
    await User.findByIdAndUpdate(userId, {
      $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 },
    });
    return;
  }
  if (!refreshToken) return;
  const dot = refreshToken.indexOf('.');
  if (dot <= 0) return;
  const id = refreshToken.slice(0, dot);
  const secret = refreshToken.slice(dot + 1);
  const user = await User.findById(id);
  if (!user?.refreshTokenHash) return;
  try {
    if (await argon2.verify(user.refreshTokenHash, secret)) {
      await User.findByIdAndUpdate(id, {
        $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 },
      });
    }
  } catch {
    // ignore
  }
}

export async function forgotPassword(email: string) {
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user || user.status === 'disabled') return { ok: true as const };
  const raw = randomBytes(32).toString('hex');
  await AuthToken.create({
    userId: user._id,
    type: 'password_reset',
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const link = `${config.frontendUrl.replace(/\/$/, '')}/reset-password?token=${raw}`;
  await sendAuthMail(
    user.email,
    'Reset your Trading OS password',
    `Reset your password with this link (expires in 1 hour):\n\n${link}\n`,
  );
  return { ok: true as const };
}

export async function resetPassword(token: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    throw new AppError('INVALID_PASSWORD', 'Password must be at least 8 characters', 400);
  }
  const doc = await AuthToken.findOne({
    type: 'password_reset',
    tokenHash: hashToken(token),
    consumedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
  if (!doc) throw new AppError('INVALID_TOKEN', 'Invalid or expired reset token', 400);
  await User.findByIdAndUpdate(doc.userId, {
    passwordHash: await argon2.hash(newPassword),
    $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 },
  });
  doc.consumedAt = new Date();
  await doc.save();
  return { ok: true as const };
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  if (!newPassword || newPassword.length < 8) {
    throw new AppError('INVALID_PASSWORD', 'Password must be at least 8 characters', 400);
  }
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  assertActive(user);
  if (!(await argon2.verify(user.passwordHash, oldPassword))) {
    throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect', 401);
  }
  user.passwordHash = await argon2.hash(newPassword);
  await user.save();
  return { ok: true as const };
}

export async function getMe(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  assertActive(user);
  return publicUser(user, await getSubscriptionStatus(userId));
}

export async function setupMfa(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  assertActive(user);
  if (user.totpEnabled) throw new AppError('MFA_ENABLED', 'MFA is already enabled', 400);
  const secret = generateTotpSecret();
  user.totpSecretEnc = encrypt(secret);
  await user.save();
  return { secret, otpauthUrl: buildOtpAuthUri({ secret, email: user.email }) };
}

export async function enableMfa(userId: string, code: string) {
  const user = await User.findById(userId);
  if (!user?.totpSecretEnc) throw new AppError('MFA_NOT_SETUP', 'Run MFA setup first', 400);
  assertActive(user);
  if (!verifyTotp(decrypt(user.totpSecretEnc), code)) {
    throw new AppError('INVALID_MFA', 'Invalid authenticator code', 400);
  }
  const backupCodes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const raw = randomBytes(5).toString('hex');
    backupCodes.push(raw);
    hashes.push(await argon2.hash(raw));
  }
  user.totpEnabled = true;
  user.totpBackupHashes = hashes;
  await user.save();
  return { backupCodes };
}

export async function disableMfa(userId: string, password: string, code: string) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  assertActive(user);
  if (!(await argon2.verify(user.passwordHash, password))) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid password', 401);
  }
  if (!user.totpEnabled || !user.totpSecretEnc) {
    throw new AppError('MFA_NOT_ENABLED', 'MFA is not enabled', 400);
  }
  const secret = decrypt(user.totpSecretEnc);
  let ok = verifyTotp(secret, code);
  if (!ok) {
    for (const h of user.totpBackupHashes ?? []) {
      if (await argon2.verify(h, code)) {
        ok = true;
        break;
      }
    }
  }
  if (!ok) throw new AppError('INVALID_MFA', 'Invalid authenticator code', 400);
  user.totpEnabled = false;
  user.totpSecretEnc = undefined;
  user.totpBackupHashes = [];
  await user.save();
  return { ok: true as const };
}

export async function verifyMfaLogin(
  payload: { sub: string; purpose?: string },
  code: string,
): Promise<UserDoc> {
  if (payload.purpose !== 'mfa') throw new AppError('INVALID_MFA_TOKEN', 'Invalid MFA token', 401);
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError('UNAUTHORIZED', 'Unauthorized', 401);
  assertActive(user);
  if (!user.totpEnabled || !user.totpSecretEnc) {
    throw new AppError('MFA_NOT_ENABLED', 'MFA is not enabled', 400);
  }
  const secret = decrypt(user.totpSecretEnc);
  if (verifyTotp(secret, code)) return user;
  const hashes = [...(user.totpBackupHashes ?? [])];
  for (let i = 0; i < hashes.length; i++) {
    if (await argon2.verify(hashes[i]!, code)) {
      hashes.splice(i, 1);
      user.totpBackupHashes = hashes;
      await user.save();
      return user;
    }
  }
  throw new AppError('INVALID_MFA', 'Invalid authenticator code', 401);
}

export async function authPlugin(app: FastifyInstance) {
  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
      const user = await User.findById(getUserId(req)).select('status');
      if (!user || user.status === 'disabled') {
        throw new AppError('ACCOUNT_DISABLED', 'Account is disabled', 403);
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('UNAUTHORIZED', 'Unauthorized', 401);
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
}
