import { User } from '../../models/User.js';
import { Subscription } from '../../models/Subscription.js';
import { Settings } from '../../models/Settings.js';
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
import {
  disableScannerForAllUsers,
  setScannerEnabled,
} from '../settings/index.js';
import { scannerService } from '../scanner/index.js';

export async function adminListUsers(q?: string) {
  const filter: Record<string, unknown> = {};
  if (q?.trim()) filter.email = { $regex: q.trim(), $options: 'i' };
  const users = await User.find(filter)
    .select('email role status totpEnabled createdAt')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const ids = users.map((u) => u._id);
  const [subs, settingsDocs] = await Promise.all([
    Subscription.find({ userId: { $in: ids } }).lean(),
    Settings.find({ userId: { $in: ids } })
      .select('userId scanner.enabled')
      .lean(),
  ]);
  const byUser = new Map(subs.map((s) => [String(s.userId), s]));
  const scannerByUser = new Map(
    settingsDocs.map((s) => [
      String(s.userId),
      (s as { scanner?: { enabled?: boolean } }).scanner?.enabled !== false,
    ]),
  );
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
      scannerEnabled: scannerByUser.get(String(u._id)) ?? true,
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
    scannerEnabled?: boolean;
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
  let scannerEnabled: boolean | undefined;
  if (typeof patch.scannerEnabled === 'boolean') {
    scannerEnabled = await setScannerEnabled(userId, patch.scannerEnabled);
    if (patch.scannerEnabled) {
      scannerService.start();
    } else {
      const { anyUserScannerEnabled } = await import('../settings/index.js');
      if (!(await anyUserScannerEnabled())) scannerService.stop();
    }
  } else {
    const s = await Settings.findOne({ userId }).select('scanner.enabled').lean();
    scannerEnabled = (s as { scanner?: { enabled?: boolean } } | null)?.scanner?.enabled !== false;
  }
  return {
    id: String(user._id),
    email: user.email,
    role: user.role,
    status: user.status,
    totpEnabled: Boolean(user.totpEnabled),
    scannerEnabled,
    subscription: await getSubscriptionStatus(userId),
  };
}

export async function adminStopAllScanners() {
  const result = await disableScannerForAllUsers();
  scannerService.stop();
  return { ...result, workerRunning: false };
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
