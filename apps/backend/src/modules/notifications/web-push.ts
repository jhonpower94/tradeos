import webpush from 'web-push';
import { config } from '../../config/index.js';
import { PushSubscription } from '../../models/PushSubscription.js';

export type PushSubInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return false;
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );
  vapidConfigured = true;
  return true;
}

export function getVapidPublicKey(): string | undefined {
  return config.vapidPublicKey;
}

export function isWebPushConfigured(): boolean {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

export async function deletePushSubscription(
  userId: string,
  endpoint: string,
): Promise<{ deletedCount: number }> {
  const result = await PushSubscription.deleteOne({ userId, endpoint });
  return { deletedCount: result.deletedCount ?? 0 };
}

export async function savePushSubscription(
  userId: string,
  sub: PushSubInput,
): Promise<{ endpoint: string }> {
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error('Invalid push subscription');
  }
  await PushSubscription.findOneAndUpdate(
    { endpoint: sub.endpoint },
    {
      $set: {
        userId,
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      },
    },
    { upsert: true, new: true },
  );
  return { endpoint: sub.endpoint };
}

export async function sendWebPushToUser(
  userId: string,
  content: { title: string; body: string; payload?: unknown },
): Promise<{ sent: number; removed: number }> {
  if (!ensureVapid()) {
    return { sent: 0, removed: 0 };
  }

  const subs = await PushSubscription.find({ userId }).lean();
  if (!subs.length) return { sent: 0, removed: 0 };

  const payload = JSON.stringify({
    title: content.title,
    body: content.body,
    data: content.payload ?? {},
  });

  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      const p256dh = sub.keys?.p256dh;
      const auth = sub.keys?.auth;
      if (!p256dh || !auth) return;
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh, auth },
          },
          payload,
        );
        sent += 1;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ endpoint: sub.endpoint });
          removed += 1;
        }
      }
    }),
  );

  return { sent, removed };
}

/** Test helper: force reset vapidConfigured between tests. */
export function _resetVapidConfiguredForTests() {
  vapidConfigured = false;
}
