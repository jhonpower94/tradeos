import { TradingMode } from '@trading-os/shared';
import { User } from '../../models/User.js';
import { Subscription } from '../../models/Subscription.js';
import { Settings } from '../../models/Settings.js';
import { AppError } from '../../utils/errors.js';

export type SubscriptionStatusDto = {
  active: boolean;
  status: 'none' | 'active' | 'expired';
  planId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  source: 'payment' | 'admin_grant' | null;
};

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatusDto> {
  const sub = await Subscription.findOne({ userId }).lean();
  if (!sub?.endsAt) {
    return {
      active: false,
      status: 'none',
      planId: null,
      startsAt: null,
      endsAt: null,
      source: null,
    };
  }
  const endsAt = new Date(sub.endsAt);
  const active = endsAt.getTime() > Date.now() && sub.status === 'active';
  return {
    active,
    status: active ? 'active' : 'expired',
    planId: sub.planId ?? null,
    startsAt: sub.startsAt ? new Date(sub.startsAt).toISOString() : null,
    endsAt: endsAt.toISOString(),
    source: (sub.source as 'payment' | 'admin_grant') ?? null,
  };
}

export async function assertCanUseLive(userId: string): Promise<void> {
  const user = await User.findById(userId).select('role status').lean();
  if (!user || user.status === 'disabled') {
    throw new AppError('FORBIDDEN', 'Account disabled', 403);
  }
  if (user.role === 'admin') return;
  const status = await getSubscriptionStatus(userId);
  if (!status.active) {
    throw new AppError(
      'SUBSCRIPTION_REQUIRED',
      'An active USDT subscription is required for live trading',
      402,
    );
  }
}

/** If live entitlement lapsed, force trading mode back to paper. */
export async function enforcePaperIfLiveLapsed(userId: string): Promise<void> {
  const user = await User.findById(userId).select('role').lean();
  if (user?.role === 'admin') return;
  const status = await getSubscriptionStatus(userId);
  if (status.active) return;
  await Settings.updateOne(
    { userId, 'trading.mode': TradingMode.LIVE },
    { $set: { 'trading.mode': TradingMode.PAPER } },
  );
}
