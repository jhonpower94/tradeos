import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const subscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    planId: { type: String },
    status: { type: String, enum: ['none', 'active', 'expired'], default: 'none' },
    startsAt: { type: Date },
    endsAt: { type: Date },
    source: { type: String, enum: ['payment', 'admin_grant'], default: 'payment' },
  },
  { timestamps: true },
);

export type SubscriptionDoc = InferSchemaType<typeof subscriptionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Subscription = mongoose.model('Subscription', subscriptionSchema);
