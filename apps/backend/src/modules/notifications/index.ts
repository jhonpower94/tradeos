import nodemailer from 'nodemailer';
import {
  NotificationChannel,
  NotificationType,
} from '@trading-os/shared';
import { Notification } from '../../models/Notification.js';
import { getRawSettings } from '../settings/index.js';
import { decrypt } from '../../utils/crypto.js';
import { config } from '../../config/index.js';

type BroadcastFn = (userId: string, channel: string, data: unknown) => void;

let broadcastFn: BroadcastFn | null = null;

export function setNotificationBroadcast(fn: BroadcastFn) {
  broadcastFn = fn;
}

export async function notify(
  userId: string,
  type: NotificationType,
  content: { title: string; body: string; payload?: unknown },
) {
  const settings = await getRawSettings(userId);
  const n = settings.notifications;

  if (n?.browser?.enabled !== false) {
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
  }

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
