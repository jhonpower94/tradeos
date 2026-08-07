import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { ApprovalMode, STRATEGY_IDS, Timeframe, TradingMode } from '@trading-os/shared';

const settingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    binance: {
      apiKeyEnc: String,
      apiSecretEnc: String,
      testnet: { type: Boolean, default: false },
      configured: { type: Boolean, default: false },
    },
    risk: {
      maxRiskPerTrade: { type: Number, default: 0.01 },
      maxDailyLoss: { type: Number, default: 0.05 },
      maxOpenPositions: { type: Number, default: 5 },
      minRiskReward: { type: Number, default: 2 },
      maxSpreadBps: { type: Number, default: 20 },
      minLiquidityUsdt: { type: Number, default: 1_000_000 },
      atrSlMultiplierMin: { type: Number, default: 0.5 },
      atrSlMultiplierMax: { type: Number, default: 5 },
      maxFreeNotionalPct: { type: Number, default: 0.25 },
    },
    trading: {
      mode: { type: String, enum: Object.values(TradingMode), default: TradingMode.PAPER },
      approval: { type: String, enum: Object.values(ApprovalMode), default: ApprovalMode.MANUAL },
      useSoftwareExits: { type: Boolean, default: true },
      feeRate: { type: Number, default: 0.001 },
      paperStartingBalance: { type: Number, default: 10_000 },
      partialTpEnabled: { type: Boolean, default: true },
      partialTpFraction: { type: Number, default: 0.33 },
      partialTpAtR: { type: Number, default: 1.5 },
      breakevenOnPartial: { type: Boolean, default: true },
      trailingEnabled: { type: Boolean, default: true },
      trailingStopPct: { type: Number, default: 1.5 },
      trailingActivateAtR: { type: Number, default: 1.5 },
      adverseREnabled: { type: Boolean, default: true },
      maxAdverseR: { type: Number, default: 0.75 },
      timeStopEnabled: { type: Boolean, default: true },
      maxHoldMs: { type: Number, default: 6 * 60 * 60 * 1000 },
      minProgressR: { type: Number, default: 0.3 },
    },
    scanner: {
      enabled: { type: Boolean, default: true },
      timeframes: {
        type: [String],
        default: [Timeframe.M15, Timeframe.H1, Timeframe.H4],
      },
      minConfidence: { type: Number, default: 75 },
      minAlignedStrategies: { type: Number, default: 2 },
      minAgreementRatio: { type: Number, default: 0.6 },
      symbolsDenyList: { type: [String], default: [] },
      hotSetSize: { type: Number, default: 50 },
      concurrency: { type: Number, default: 5 },
      htfVetoEnabled: { type: Boolean, default: true },
    },
    strategies: {
      type: Map,
      of: new Schema(
        {
          enabled: { type: Boolean, default: true },
          params: { type: Schema.Types.Mixed, default: {} },
        },
        { _id: false },
      ),
      default: () => {
        const map: Record<string, { enabled: boolean; params: object }> = {};
        for (const id of STRATEGY_IDS) map[id] = { enabled: true, params: {} };
        return map;
      },
    },
    notifications: {
      telegram: {
        enabled: { type: Boolean, default: false },
        chatId: String,
        botTokenEnc: String,
      },
      discord: {
        enabled: { type: Boolean, default: false },
        webhookUrlEnc: String,
      },
      email: {
        enabled: { type: Boolean, default: false },
        address: String,
      },
      browser: {
        enabled: { type: Boolean, default: true },
      },
    },
    regime: {
      enabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Settings = mongoose.model('Settings', settingsSchema);
