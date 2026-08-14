import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  shouldNotifyProfitHigh,
  shouldNotifyProfitLow,
  PROFIT_HIGH_MIN_STEP_USDT,
} from '../src/modules/position/profit-high.js';
import { config } from '../src/config/index.js';
import webpush from 'web-push';

const store = new Map<string, { userId: string; endpoint: string; keys: { p256dh: string; auth: string } }>();

vi.mock('../src/models/PushSubscription.js', () => ({
  PushSubscription: {
    findOneAndUpdate: vi.fn(async (filter: { endpoint: string }, update: { $set: Record<string, unknown> }) => {
      const prev = store.get(filter.endpoint);
      const next = { ...(prev ?? { endpoint: filter.endpoint }), ...update.$set } as {
        userId: string;
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      store.set(filter.endpoint, next);
      return { ...next, _id: 'mock-id' };
    }),
    deleteOne: vi.fn(async (filter: { endpoint?: string; userId?: string }) => {
      if (filter.endpoint) {
        const doc = store.get(filter.endpoint);
        if (doc && (!filter.userId || String(doc.userId) === String(filter.userId))) {
          store.delete(filter.endpoint);
          return { deletedCount: 1 };
        }
      }
      return { deletedCount: 0 };
    }),
    find: vi.fn((filter: { userId: string }) => ({
      lean: async () =>
        [...store.values()].filter((s) => String(s.userId) === String(filter.userId)),
    })),
    countDocuments: vi.fn(async () => store.size),
  },
}));

import {
  savePushSubscription,
  deletePushSubscription,
  sendWebPushToUser,
  _resetVapidConfiguredForTests,
} from '../src/modules/notifications/web-push.js';
import { PushSubscription } from '../src/models/PushSubscription.js';

describe('shouldNotifyProfitHigh', () => {
  it('does not notify when upnl is not positive', () => {
    expect(shouldNotifyProfitHigh(0, 0).notify).toBe(false);
    expect(shouldNotifyProfitHigh(-1, 0).notify).toBe(false);
  });

  it('notifies on first profit peak of at least min step', () => {
    const r = shouldNotifyProfitHigh(1.5, 0);
    expect(r.notify).toBe(true);
    expect(r.newPeak).toBe(1.5);
  });

  it('does not notify for tiny ticks below min step', () => {
    expect(shouldNotifyProfitHigh(0.5, 0).notify).toBe(false);
    expect(shouldNotifyProfitHigh(5.5, 5).notify).toBe(false);
  });

  it('notifies when beating previous peak by >= min step', () => {
    const r = shouldNotifyProfitHigh(5 + PROFIT_HIGH_MIN_STEP_USDT, 5);
    expect(r.notify).toBe(true);
    expect(r.newPeak).toBe(6);
  });
});

describe('shouldNotifyProfitLow', () => {
  it('does not notify when upnl is not negative', () => {
    expect(shouldNotifyProfitLow(0, 0).notify).toBe(false);
    expect(shouldNotifyProfitLow(1, 0).notify).toBe(false);
  });

  it('notifies on first loss trough of at least min step', () => {
    const r = shouldNotifyProfitLow(-1.5, 0);
    expect(r.notify).toBe(true);
    expect(r.newTrough).toBe(-1.5);
  });

  it('does not notify for tiny ticks below min step', () => {
    expect(shouldNotifyProfitLow(-0.5, 0).notify).toBe(false);
    expect(shouldNotifyProfitLow(-5.5, -5).notify).toBe(false);
  });

  it('notifies when beating previous trough by >= min step', () => {
    const r = shouldNotifyProfitLow(-5 - PROFIT_HIGH_MIN_STEP_USDT, -5);
    expect(r.notify).toBe(true);
    expect(r.newTrough).toBe(-6);
  });
});

describe('push subscription helpers', () => {
  const prevPublic = config.vapidPublicKey;
  const prevPrivate = config.vapidPrivateKey;

  beforeEach(() => {
    store.clear();
    _resetVapidConfiguredForTests();
    (config as { vapidPublicKey?: string }).vapidPublicKey = 'BTestPublicKey';
    (config as { vapidPrivateKey?: string }).vapidPrivateKey = 'TestPrivateKey';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetVapidConfiguredForTests();
    (config as { vapidPublicKey?: string }).vapidPublicKey = prevPublic;
    (config as { vapidPrivateKey?: string }).vapidPrivateKey = prevPrivate;
  });

  it('upserts subscription by endpoint', async () => {
    await savePushSubscription('user1', {
      endpoint: 'https://push.example/a',
      keys: { p256dh: 'p1', auth: 'a1' },
    });
    await savePushSubscription('user1', {
      endpoint: 'https://push.example/a',
      keys: { p256dh: 'p2', auth: 'a2' },
    });
    expect(store.size).toBe(1);
    expect(store.get('https://push.example/a')?.keys.p256dh).toBe('p2');
    expect(PushSubscription.findOneAndUpdate).toHaveBeenCalled();
  });

  it('deletePushSubscription removes by user + endpoint', async () => {
    await savePushSubscription('user1', {
      endpoint: 'https://push.example/b',
      keys: { p256dh: 'p', auth: 'a' },
    });
    await deletePushSubscription('user1', 'https://push.example/b');
    expect(store.size).toBe(0);
  });

  it('removes subscription when web-push returns 410', async () => {
    await savePushSubscription('user1', {
      endpoint: 'https://push.example/dead',
      keys: { p256dh: 'p', auth: 'a' },
    });

    vi.spyOn(webpush, 'setVapidDetails').mockImplementation(() => undefined);
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
      Object.assign(new Error('gone'), { statusCode: 410 }),
    );

    const result = await sendWebPushToUser('user1', { title: 't', body: 'b' });
    expect(result.removed).toBe(1);
    expect(store.size).toBe(0);
  });
});
