import { User } from '../../models/User.js';
import { Subscription } from '../../models/Subscription.js';
import { AppError } from '../../utils/errors.js';
import {
  adminConfirmInvoice,
  adminGrantSubscription,
  adminRejectInvoice,
  adminRevokeSubscription,
  getOrCreateSubscriptionSettings,
  listInvoicesAdmin,
  updateSubscriptionSettings,
} from '../subscription/index.js';
import { getSubscriptionStatus } from '../subscription/entitlement.js';

export async function adminListUsers(q?: string) {
  const filter: Record<string, unknown> = {};
  if (q?.trim()) filter.email = { $regex: q.trim(), $options: 'i' };
  const users = await User.find(filter)
    .select('email role status totpEnabled createdAt')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const ids = users.map((u) => u._id);
  const subs = await Subscription.find({ userId: { $in: ids } }).lean();
  const byUser = new Map(subs.map((s) => [String(s.userId), s]));
  return users.map((u) => {
    const sub = byUser.get(String(u._id));
    const active = Boolean(
      sub?.endsAt && new Date(sub.endsAt).getTime() > Date.now() && sub.status === 'active',
    );
    return {
      id: String(u._id),
      email: u.email,
      role: u.role,
      status: u.status,
      totpEnabled: Boolean(u.totpEnabled),
      createdAt: u.createdAt,
      subscription: {
        active,
        endsAt: sub?.endsAt ? new Date(sub.endsAt).toISOString() : null,
        planId: sub?.planId ?? null,
      },
    };
  });
}

export async function adminPatchUser(
  userId: string,
  patch: {
    role?: 'user' | 'admin';
    status?: 'active' | 'disabled';
    clearMfa?: boolean;
    grantDays?: number;
    revokeSubscription?: boolean;
  },
) {
  const user = await User.findById(userId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  if (patch.role) user.role = patch.role;
  if (patch.status) user.status = patch.status;
  if (patch.clearMfa) {
    user.totpEnabled = false;
    user.totpSecretEnc = undefined;
    user.totpBackupHashes = [];
  }
  await user.save();
  if (patch.revokeSubscription) await adminRevokeSubscription(userId);
  if (patch.grantDays && patch.grantDays > 0) {
    await adminGrantSubscription(userId, patch.grantDays);
  }
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    status: user.status,
    totpEnabled: Boolean(user.totpEnabled),
    subscription: await getSubscriptionStatus(userId),
  };
}

export async function adminOverview() {
  const [users, activeSubs, settings] = await Promise.all([
    User.countDocuments(),
    Subscription.countDocuments({ status: 'active', endsAt: { $gt: new Date() } }),
    getOrCreateSubscriptionSettings(),
  ]);
  const underpaid = await listInvoicesAdmin({ status: 'underpaid' });
  const overpaid = await listInvoicesAdmin({ status: 'overpaid' });
  return {
    userCount: users,
    activeSubscriptions: activeSubs,
    underpaidInvoices: underpaid.length,
    overpaidInvoices: overpaid.length,
    walletCount: settings.wallets?.length ?? 0,
    planCount: settings.plans?.length ?? 0,
  };
}

export {
  getOrCreateSubscriptionSettings as adminGetSubscriptionSettings,
  updateSubscriptionSettings as adminUpdateSubscriptionSettings,
  listInvoicesAdmin as adminListInvoices,
  adminConfirmInvoice,
  adminRejectInvoice,
  adminGrantSubscription,
  adminRevokeSubscription,
};
