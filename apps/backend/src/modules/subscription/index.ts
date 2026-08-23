import { randomInt } from 'node:crypto';
import { AppError } from '../../utils/errors.js';
import { SubscriptionSettings } from '../../models/SubscriptionSettings.js';
import { Subscription } from '../../models/Subscription.js';
import { SubscriptionInvoice } from '../../models/SubscriptionInvoice.js';
import { getSubscriptionStatus } from './entitlement.js';

export type PaymentNetwork = 'trc20' | 'bep20' | 'erc20';

const DEFAULT_PLANS = [
  { id: 'monthly', name: 'Monthly Live', priceUsdt: 29, durationDays: 30, active: true },
  { id: 'quarterly', name: 'Quarterly Live', priceUsdt: 79, durationDays: 90, active: true },
];

export async function getOrCreateSubscriptionSettings() {
  let doc = await SubscriptionSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await SubscriptionSettings.create({
      key: 'default',
      plans: DEFAULT_PLANS,
      wallets: [],
      defaultNetwork: 'trc20',
      amountToleranceUsdt: 0.01,
      invoiceTtlHours: 24,
      watcherPollSeconds: 45,
    });
  }
  return doc;
}

export async function updateSubscriptionSettings(patch: {
  plans?: Array<{
    id: string;
    name: string;
    priceUsdt: number;
    durationDays: number;
    active?: boolean;
  }>;
  wallets?: Array<{ network: PaymentNetwork; address: string; label?: string }>;
  defaultNetwork?: PaymentNetwork;
  amountToleranceUsdt?: number;
  invoiceTtlHours?: number;
  watcherPollSeconds?: number;
}) {
  const doc = await getOrCreateSubscriptionSettings();
  if (patch.plans) doc.plans = patch.plans as typeof doc.plans;
  if (patch.wallets) doc.wallets = patch.wallets as typeof doc.wallets;
  if (patch.defaultNetwork) doc.defaultNetwork = patch.defaultNetwork;
  if (patch.amountToleranceUsdt != null) doc.amountToleranceUsdt = patch.amountToleranceUsdt;
  if (patch.invoiceTtlHours != null) doc.invoiceTtlHours = patch.invoiceTtlHours;
  if (patch.watcherPollSeconds != null) doc.watcherPollSeconds = patch.watcherPollSeconds;
  await doc.save();
  return doc;
}

function roundUsdt(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

async function allocateUniqueAmount(base: number): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const micros = randomInt(1, 9999);
    const amount = roundUsdt(base + micros / 1_000_000);
    const clash = await SubscriptionInvoice.findOne({
      status: 'pending',
      amountUsdt: amount,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!clash) return amount;
  }
  throw new AppError('AMOUNT_ALLOC_FAILED', 'Could not allocate unique invoice amount', 500);
}

export function classifyPaymentAmount(
  expected: number,
  observed: number,
  tolerance = 0.01,
): 'exact' | 'under' | 'over' {
  const delta = observed - expected;
  if (Math.abs(delta) <= tolerance) return 'exact';
  return delta < 0 ? 'under' : 'over';
}

export async function listActivePlans() {
  const settings = await getOrCreateSubscriptionSettings();
  return {
    plans: (settings.plans ?? []).filter((p) => p.active !== false),
    wallets: settings.wallets ?? [],
    defaultNetwork: settings.defaultNetwork ?? 'trc20',
  };
}

export async function createInvoice(userId: string, planId: string, network?: PaymentNetwork) {
  const settings = await getOrCreateSubscriptionSettings();
  const plan = (settings.plans ?? []).find((p) => p.id === planId && p.active !== false);
  if (!plan) throw new AppError('PLAN_NOT_FOUND', 'Plan not found', 404);
  const net = (network ?? settings.defaultNetwork ?? 'trc20') as PaymentNetwork;
  const wallet = (settings.wallets ?? []).find((w) => w.network === net);
  if (!wallet?.address) {
    throw new AppError('WALLET_NOT_CONFIGURED', `No treasury wallet configured for ${net}`, 400);
  }
  await SubscriptionInvoice.updateMany(
    { userId, status: 'pending', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired' } },
  );
  const amountUsdt = await allocateUniqueAmount(Number(plan.priceUsdt));
  const ttlHours = settings.invoiceTtlHours ?? 24;
  return SubscriptionInvoice.create({
    userId,
    planId: plan.id,
    network: net,
    address: wallet.address,
    baseAmountUsdt: Number(plan.priceUsdt),
    amountUsdt,
    status: 'pending',
    expiresAt: new Date(Date.now() + ttlHours * 3600_000),
  });
}

export async function listMyInvoices(userId: string) {
  return SubscriptionInvoice.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
}

export async function submitInvoiceTx(userId: string, invoiceId: string, txHash: string) {
  const invoice = await SubscriptionInvoice.findOne({ _id: invoiceId, userId });
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
  if (invoice.status !== 'pending' && invoice.status !== 'underpaid') {
    throw new AppError('INVALID_STATUS', 'Invoice is not awaiting payment', 400);
  }
  if (invoice.expiresAt.getTime() < Date.now()) {
    invoice.status = 'expired';
    await invoice.save();
    throw new AppError('INVOICE_EXPIRED', 'Invoice expired', 400);
  }
  const hash = txHash.trim();
  if (!hash) throw new AppError('INVALID_TX', 'txHash required', 400);
  const used = await SubscriptionInvoice.findOne({
    txHash: hash,
    _id: { $ne: invoice._id },
  }).lean();
  if (used) throw new AppError('TX_USED', 'Transaction already used', 409);
  invoice.txHash = hash;
  await invoice.save();
  return invoice;
}

export async function activateSubscriptionFromInvoice(
  invoiceId: string,
  opts: { txHash?: string; observedAmount?: number; status?: 'paid' | 'overpaid' },
) {
  const invoice = await SubscriptionInvoice.findById(invoiceId);
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
  if (invoice.status === 'paid' || invoice.status === 'overpaid') return { invoice };

  const settings = await getOrCreateSubscriptionSettings();
  const plan = (settings.plans ?? []).find((p) => p.id === invoice.planId);
  if (!plan) throw new AppError('PLAN_NOT_FOUND', 'Plan missing', 404);

  const now = new Date();
  let sub = await Subscription.findOne({ userId: invoice.userId });
  const base =
    sub?.endsAt && new Date(sub.endsAt).getTime() > now.getTime()
      ? new Date(sub.endsAt)
      : now;
  const endsAt = new Date(base.getTime() + Number(plan.durationDays) * 86_400_000);

  if (!sub) {
    sub = await Subscription.create({
      userId: invoice.userId,
      planId: plan.id,
      status: 'active',
      startsAt: now,
      endsAt,
      source: 'payment',
    });
  } else {
    sub.planId = plan.id;
    sub.status = 'active';
    if (!sub.startsAt) sub.startsAt = now;
    sub.endsAt = endsAt;
    sub.source = 'payment';
    await sub.save();
  }

  invoice.status = opts.status ?? 'paid';
  if (opts.txHash) invoice.txHash = opts.txHash;
  if (opts.observedAmount != null) invoice.observedAmount = opts.observedAmount;
  await invoice.save();
  return { invoice, subscription: sub };
}

export async function adminGrantSubscription(userId: string, days: number, planId?: string) {
  if (!(days > 0)) throw new AppError('INVALID_DAYS', 'days must be positive', 400);
  const now = new Date();
  let sub = await Subscription.findOne({ userId });
  const base =
    sub?.endsAt && new Date(sub.endsAt).getTime() > now.getTime()
      ? new Date(sub.endsAt)
      : now;
  const endsAt = new Date(base.getTime() + days * 86_400_000);
  if (!sub) {
    sub = await Subscription.create({
      userId,
      planId: planId ?? 'admin',
      status: 'active',
      startsAt: now,
      endsAt,
      source: 'admin_grant',
    });
  } else {
    sub.planId = planId ?? sub.planId ?? 'admin';
    sub.status = 'active';
    if (!sub.startsAt) sub.startsAt = now;
    sub.endsAt = endsAt;
    sub.source = 'admin_grant';
    await sub.save();
  }
  return sub;
}

export async function adminRevokeSubscription(userId: string) {
  return Subscription.findOneAndUpdate(
    { userId },
    { $set: { status: 'expired', endsAt: new Date() } },
    { new: true },
  );
}

export async function getUserSubscription(userId: string) {
  return getSubscriptionStatus(userId);
}

export async function listInvoicesAdmin(filter?: { status?: string }) {
  const q: Record<string, unknown> = {};
  if (filter?.status) q.status = filter.status;
  return SubscriptionInvoice.find(q).sort({ createdAt: -1 }).limit(100).lean();
}

export async function adminConfirmInvoice(invoiceId: string, txHash?: string) {
  return activateSubscriptionFromInvoice(invoiceId, { txHash, status: 'paid' });
}

export async function adminRejectInvoice(invoiceId: string, note?: string) {
  const invoice = await SubscriptionInvoice.findById(invoiceId);
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
  invoice.status = 'cancelled';
  if (note) invoice.note = note;
  await invoice.save();
  return invoice;
}
