import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 });

export type PushSubscriptionDoc = InferSchemaType<typeof pushSubscriptionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
