import { z } from 'zod';
import {
  ApprovalMode,
  Side,
  Timeframe,
  TradingMode,
  STRATEGY_IDS,
} from '../constants/index.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const riskSettingsSchema = z.object({
  maxRiskPerTrade: z.number().min(0.001).max(0.1).default(0.01),
  maxDailyLoss: z.number().min(0.01).max(0.5).default(0.05),
  maxOpenPositions: z.number().int().min(1).max(50).default(5),
  minRiskReward: z.number().min(0.5).max(10).default(2),
  maxSpreadBps: z.number().min(1).max(100).default(20),
  minLiquidityUsdt: z.number().min(0).default(1_000_000),
  atrSlMultiplierMin: z.number().default(0.5),
  atrSlMultiplierMax: z.number().default(5),
  /** Legacy field kept so old clients can still PATCH it. Slot sizing is the notional cap. */
  maxFreeNotionalPct: z.number().min(0.05).max(1).default(1),
  /** USDT floor per entry. 0 disables. Free balance is split across remaining slots. */
  minNotionalPerTrade: z.number().min(0).max(1_000_000).default(1000),
});

export const tradingSettingsSchema = z.object({
  mode: z.nativeEnum(TradingMode).default(TradingMode.PAPER),
  approval: z.nativeEnum(ApprovalMode).default(ApprovalMode.MANUAL),
  useSoftwareExits: z.boolean().default(true),
  feeRate: z.number().min(0).max(0.01).default(0.001),
  paperStartingBalance: z.number().min(0).default(10_000),
  partialTpEnabled: z.boolean().default(true),
  partialTpFraction: z.number().min(0.05).max(0.95).default(0.33),
  partialTpAtR: z.number().min(0.25).max(5).default(1.5),
  breakevenOnPartial: z.boolean().default(true),
  trailingEnabled: z.boolean().default(true),
  trailingStopPct: z.number().min(0.1).max(20).default(1.5),
  trailingActivateAtR: z.number().min(0.25).max(5).default(1.5),
  adverseREnabled: z.boolean().default(true),
  maxAdverseR: z.number().min(0.1).max(2).default(0.75),
  timeStopEnabled: z.boolean().default(true),
  maxHoldMs: z
    .number()
    .min(60_000)
    .max(7 * 24 * 60 * 60 * 1000)
    .default(6 * 60 * 60 * 1000),
  minProgressR: z.number().min(0).max(1).default(0.3),
});

export const scannerSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  timeframes: z.array(z.nativeEnum(Timeframe)).default([
    Timeframe.M15,
    Timeframe.H1,
    Timeframe.H4,
  ]),
  minConfidence: z.number().min(0).max(100).default(75),
  minAlignedStrategies: z.number().int().min(1).max(STRATEGY_IDS.length).default(2),
  minAgreementRatio: z.number().min(0).max(1).default(0.6),
  symbolsDenyList: z.array(z.string()).default([]),
  hotSetSize: z.number().int().min(10).max(500).default(50),
  concurrency: z.number().int().min(1).max(20).default(5),
  htfVetoEnabled: z.boolean().default(true),
  entryStyle: z.enum(['confirmed', 'early']).default('confirmed'),
  locationGateEnabled: z.boolean().default(true),
  locationProximityAtr: z.number().min(0.25).max(5).default(1.5),
  btcRelativeStrengthEnabled: z.boolean().default(true),
});

export const notificationSettingsSchema = z.object({
  telegram: z
    .object({
      enabled: z.boolean().default(false),
      chatId: z.string().optional(),
      botToken: z.string().optional(),
    })
    .default({}),
  discord: z
    .object({
      enabled: z.boolean().default(false),
      webhookUrl: z.string().optional(),
    })
    .default({}),
  email: z
    .object({
      enabled: z.boolean().default(false),
      address: z.string().email().optional(),
    })
    .default({}),
  browser: z
    .object({
      enabled: z.boolean().default(true),
    })
    .default({ enabled: true }),
});

export const strategyParamsSchema = z.record(z.unknown()).default({});

export const strategiesSettingsSchema = z.record(
  z.enum(STRATEGY_IDS as unknown as [string, ...string[]]),
  z.object({
    enabled: z.boolean().default(true),
    params: strategyParamsSchema,
  }),
);

export const binanceSettingsSchema = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  testnet: z.boolean().default(false),
  configured: z.boolean().default(false),
});

export const regimeSettingsSchema = z.object({
  enabled: z.boolean().default(true),
});

export const updateSettingsSchema = z.object({
  risk: riskSettingsSchema.partial().optional(),
  trading: tradingSettingsSchema.partial().optional(),
  scanner: scannerSettingsSchema.partial().optional(),
  notifications: notificationSettingsSchema.partial().optional(),
  strategies: strategiesSettingsSchema.optional(),
  regime: regimeSettingsSchema.partial().optional(),
});

export const candlesQuerySchema = z.object({
  symbol: z.string().min(3),
  interval: z.nativeEnum(Timeframe),
  limit: z.coerce.number().int().min(1).max(1500).default(500),
});

export const approveSignalSchema = z.object({
  orderType: z.enum(['MARKET', 'LIMIT']).default('MARKET'),
  limitPrice: z.number().positive().optional(),
});

export const createTradeSchema = z.object({
  symbol: z.string(),
  side: z.nativeEnum(Side),
  qty: z.number().positive(),
  orderType: z.enum(['MARKET', 'LIMIT']).default('MARKET'),
  price: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
});

/** Copy opens from a fresh symbol rescan; levels are not client-supplied. */
export const copyTradeSchema = z.object({
  orderType: z.enum(['MARKET', 'LIMIT']).default('MARKET'),
  limitPrice: z.number().positive().optional(),
});

export const updatePositionLevelsSchema = z.object({
  stopLoss: z.number().positive().optional(),
  takeProfit: z.number().positive().optional(),
  trailingStopPct: z.number().positive().optional(),
});

export const backtestRequestSchema = z.object({
  strategyId: z.enum(STRATEGY_IDS as unknown as [string, ...string[]]),
  symbol: z.string(),
  interval: z.nativeEnum(Timeframe),
  startTime: z.number(),
  endTime: z.number(),
  initialCapital: z.number().positive().default(10_000),
  params: z.record(z.unknown()).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type RiskSettings = z.infer<typeof riskSettingsSchema>;
export type TradingSettings = z.infer<typeof tradingSettingsSchema>;
export type ScannerSettings = z.infer<typeof scannerSettingsSchema>;
export type RegimeSettings = z.infer<typeof regimeSettingsSchema>;
