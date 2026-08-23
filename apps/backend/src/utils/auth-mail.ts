import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

export async function sendAuthMail(to: string, subject: string, text: string): Promise<void> {
  if (!config.smtp.host) {
    console.warn(`[auth-mail] SMTP not configured; would send to ${to}: ${subject}\n${text}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  await transporter.sendMail({
    from: config.smtp.from ?? 'trading-os@localhost',
    to,
    subject,
    text,
  });
}
