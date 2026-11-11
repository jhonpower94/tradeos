import nodemailer from 'nodemailer';
import {
  NotificationChannel,
  NotificationType,
} from '@trading-os/shared';
import { Notification } from '../../models/Notification.js';
import { PushSubscription } from '../../models/PushSubscription.js';
import { getRawSettings } from '../settings/index.js';
import { decrypt } from '../../utils/crypto.js';
import { config } from '../../config/index.js';
import { isWebPushConfigured, sendWebPushToUser } from './web-push.js';

type BroadcastFn = (userId: string, channel: string, data: unknown) => void;

let broadcastFn: BroadcastFn | null = null;

export function setNotificationBroadcast(fn: BroadcastFn) {
  broadcastFn = fn;
}

export type NotifyResult = {
  /** Browser/Mongo row was written (and WS broadcast attempted). */
  browserRecorded: boolean;
  pushConfigured: boolean;
  /** Push endpoints that existed when delivery was attempted. */
  pushAttempted: number;
  pushSent: number;
  /** Telegram / Discord / email delivered. */
  externalSent: boolean;
};

/**
 * Commit a profit high/low watermark only when a closed-app channel likely delivered,
 * or when the user has no push targets (avoid blocking forever).
 */
export function shouldCommitProfitExtreme(result: NotifyResult): boolean {
  if (result.externalSent) return true;
  if (!result.pushConfigured) return true;
  if (result.pushAttempted <= 0) return true;
  return result.pushSent > 0;
}

async function sendExternalChannels(
  userId: string,
  type: NotificationType,
  content: { title: string; body: string; payload?: unknown },
  n: Awaited<ReturnType<typeof getRawSettings>>['notifications'],
): Promise<boolean> {
  let externalSent = false;

  if (n?.telegram?.enabled && n.telegram.chatId) {
    const token =
      (n.telegram.botTokenEnc ? decrypt(n.telegram.botTokenEnc) : null) ||
      config.telegramBotToken;
    if (token) {
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: n.telegram.chatId,
            text: `*${content.title}*\n${content.body}`,
            parse_mode: 'Markdown',
          }),
        });
        await Notification.create({
          userId,
          channel: NotificationChannel.TELEGRAM,
          type,
          title: content.title,
          body: content.body,
          status: 'sent',
          sentAt: new Date(),
        });
        externalSent = true;
      } catch (e) {
        await Notification.create({
          userId,
          channel: NotificationChannel.TELEGRAM,
          type,
          title: content.title,
          body: content.body,
          status: 'failed',
          error: String(e),
        });
      }
    }
  }

  if (n?.discord?.enabled) {
    const webhook =
      (n.discord.webhookUrlEnc ? decrypt(n.discord.webhookUrlEnc) : null) ||
      config.discordWebhookUrl;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `**${content.title}**\n${content.body}`,
          }),
        });
        await Notification.create({
          userId,
          channel: NotificationChannel.DISCORD,
          type,
          title: content.title,
          body: content.body,
          status: 'sent',
          sentAt: new Date(),
        });
        externalSent = true;
      } catch (e) {
        await Notification.create({
          userId,
          channel: NotificationChannel.DISCORD,
          type,
          title: content.title,
          body: content.body,
          status: 'failed',
          error: String(e),
        });
      }
    }
  }

  if (n?.email?.enabled && n.email.address && config.smtp.host) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        auth: config.smtp.user
          ? { user: config.smtp.user, pass: config.smtp.pass }
          : undefined,
      });
      await transporter.sendMail({
        from: config.smtp.from ?? 'trading-os@localhost',
        to: n.email.address,
        subject: content.title,
        text: content.body,
      });
      await Notification.create({
        userId,
        channel: NotificationChannel.EMAIL,
        type,
        title: content.title,
        body: content.body,
        status: 'sent',
        sentAt: new Date(),
      });
      externalSent = true;
    } catch (e) {
      await Notification.create({
        userId,
        channel: NotificationChannel.EMAIL,
        type,
        title: content.title,
        body: content.body,
        status: 'failed',
        error: String(e),
      });
    }
  }

  return externalSent;
}

export async function notify(
  userId: string,
  type: NotificationType,
  content: { title: string; body: string; payload?: unknown },
  opts?: {
    /**
     * For uPnL high/low: if the user has Web Push subscriptions, require at least one
     * successful push (or Telegram/Discord/email) before recording the browser event.
     * Failed push leaves peak/trough unchanged so the next mark tick can retry.
     */
    requireReachableDevice?: boolean;
  },
): Promise<NotifyResult> {
  const settings = await getRawSettings(userId);
  const n = settings.notifications;
  const browserEnabled = n?.browser?.enabled !== false;
  const pushConfigured = isWebPushConfigured();

  const result: NotifyResult = {
    browserRecorded: false,
    pushConfigured,
    pushAttempted: 0,
    pushSent: 0,
    externalSent: false,
  };

  let pushSubs = 0;
  if (browserEnabled && pushConfigured) {
    pushSubs = await PushSubscription.countDocuments({ userId });
  }

  const mustDeliverPush =
    Boolean(opts?.requireReachableDevice) && browserEnabled && pushConfigured && pushSubs > 0;

  // Closed-app channels first when we may gate the watermark on delivery.
  if (mustDeliverPush) {
    result.pushAttempted = pushSubs;
    try {
      const push = await sendWebPushToUser(userId, { ...content, type });
      result.pushSent = push.sent;
    } catch (e) {
      console.error('Web Push send failed', e);
    }
  }

  result.externalSent = await sendExternalChannels(userId, type, content, n);

  if (mustDeliverPush && !shouldCommitProfitExtreme(result)) {
    // Do not write a browser row or advance caller watermark — retry next mark tick.
    return result;
  }

  if (browserEnabled) {
    if (!mustDeliverPush && pushConfigured && pushSubs > 0) {
      result.pushAttempted = pushSubs;
      try {
        const push = await sendWebPushToUser(userId, { ...content, type });
        result.pushSent = push.sent;
      } catch (e) {
        console.error('Web Push send failed', e);
      }
    }

    const doc = await Notification.create({
      userId,
      channel: NotificationChannel.BROWSER,
      type,
      title: content.title,
      body: content.body,
      payload: content.payload,
      status: 'sent',
      sentAt: new Date(),
    });
    broadcastFn?.(userId, 'notifications', {
      id: doc._id,
      type,
      title: content.title,
      body: content.body,
      payload: content.payload,
    });
    result.browserRecorded = true;
  }

  return result;
}

export async function listNotifications(userId: string) {
  return Notification.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();
}

export async function markRead(userId: string, id: string) {
  return Notification.findOneAndUpdate(
    { _id: id, userId },
    { status: 'read' },
    { new: true },
  );
}

export {
  savePushSubscription,
  deletePushSubscription,
  getVapidPublicKey,
  isWebPushConfigured,
  sendWebPushToUser,
} from './web-push.js';
