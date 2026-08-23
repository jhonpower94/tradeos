import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const planSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    priceUsdt: { type: Number, required: true, min: 0 },
    durationDays: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
  },
  { _id: false },
);

const walletSchema = new Schema(
  {
    network: { type: String, enum: ['trc20', 'bep20', 'erc20'], required: true },
    address: { type: String, required: true },
    label: { type: String, default: '' },
  },
  { _id: false },
);

const subscriptionSettingsSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    plans: { type: [planSchema], default: [] },
    wallets: { type: [walletSchema], default: [] },
    defaultNetwork: { type: String, enum: ['trc20', 'bep20', 'erc20'], default: 'trc20' },
    amountToleranceUsdt: { type: Number, default: 0.01 },
    invoiceTtlHours: { type: Number, default: 24 },
    watcherPollSeconds: { type: Number, default: 45 },
  },
  { timestamps: true },
);

export type SubscriptionSettingsDoc = InferSchemaType<typeof subscriptionSettingsSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const SubscriptionSettings = mongoose.model(
  'SubscriptionSettings',
  subscriptionSettingsSchema,
);
