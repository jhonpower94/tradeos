import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { registerSchema, loginSchema } from '@trading-os/shared';
import { User, type UserDoc } from '../../models/User.js';
import { Settings } from '../../models/Settings.js';
import { AppError } from '../../utils/errors.js';
import { STRATEGY_IDS } from '@trading-os/shared';
import { config } from '../../config/index.js';

export async function registerUser(email: string, password: string) {
  const parsed = registerSchema.parse({ email, password });
  const existing = await User.findOne({ email: parsed.email });
  if (existing) throw new AppError('EMAIL_EXISTS', 'Email already registered', 409);
  const passwordHash = await argon2.hash(parsed.password);
  const user = await User.create({ email: parsed.email, passwordHash });
  const strategies: Record<string, { enabled: boolean; params: object }> = {};
  for (const id of STRATEGY_IDS) strategies[id] = { enabled: true, params: {} };
  await Settings.create({ userId: user._id, strategies });
  return user;
}

export async function loginUser(email: string, password: string) {
  const parsed = loginSchema.parse({ email, password });
  const user = await User.findOne({ email: parsed.email });
  if (!user) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  const ok = await argon2.verify(user.passwordHash, parsed.password);
  if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  return user;
}

export function getUserId(req: FastifyRequest): string {
  const id = (req.user as { sub?: string } | undefined)?.sub;
  if (!id) throw new AppError('UNAUTHORIZED', 'Unauthorized', 401);
  return id;
}

function parseDurationMs(value: string): number {
  const m = /^(\d+)([smhd])$/i.exec(value.trim());
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  const mult =
    unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return n * mult;
}

/** Opaque refresh token: `{userId}.{secret}`; only the secret is hashed. */
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
  if (!user?.refreshTokenHash) {
    throw new AppError('UNAUTHORIZED', 'Invalid refresh token', 401);
  }
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
  if (refreshToken) {
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
}

export async function authPlugin(app: FastifyInstance) {
  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new AppError('UNAUTHORIZED', 'Unauthorized', 401);
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
}
