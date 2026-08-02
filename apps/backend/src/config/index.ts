import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '../../../../.env') });
loadEnv();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/trading-os',
  redisUrl: process.env.REDIS_URL || undefined,
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me-in-production-please'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  encryptionKey: required(
    'ENCRYPTION_KEY',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ),
  binanceRestUrl: process.env.BINANCE_REST_URL ?? 'https://api.binance.com',
  binanceWsUrl: process.env.BINANCE_WS_URL ?? 'wss://stream.binance.com:9443',
  binanceTestnet: process.env.BINANCE_TESTNET === 'true',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  feeRate: Number(process.env.FEE_RATE ?? 0.001),
  scannerConcurrency: Number(process.env.SCANNER_CONCURRENCY ?? 5),
  minConsensusScore: Number(process.env.MIN_CONSENSUS_SCORE ?? 75),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
};
