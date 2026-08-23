import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const subscriptionInvoiceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    planId: { type: String, required: true },
    network: { type: String, enum: ['trc20', 'bep20', 'erc20'], required: true },
    address: { type: String, required: true },
    baseAmountUsdt: { type: Number, required: true },
    amountUsdt: { type: Number, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'paid', 'underpaid', 'overpaid', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },
    txHash: { type: String, sparse: true },
    observedAmount: { type: Number },
    note: { type: String },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

subscriptionInvoiceSchema.index(
  { amountUsdt: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
subscriptionInvoiceSchema.index(
  { txHash: 1 },
  { unique: true, partialFilterExpression: { txHash: { $type: 'string' } } },
);

export type SubscriptionInvoiceDoc = InferSchemaType<typeof subscriptionInvoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const SubscriptionInvoice = mongoose.model(
  'SubscriptionInvoice',
  subscriptionInvoiceSchema,
);
