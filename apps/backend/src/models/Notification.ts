import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { NotificationChannel, NotificationType } from '@trading-os/shared';

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channel: { type: String, enum: Object.values(NotificationChannel), required: true },
    type: { type: String, enum: Object.values(NotificationType), required: true },
    title: String,
    body: String,
    payload: Schema.Types.Mixed,
    status: { type: String, enum: ['pending', 'sent', 'failed', 'read'], default: 'pending' },
    sentAt: Date,
    error: String,
  },
  { timestamps: true },
);

export type NotificationDoc = InferSchemaType<typeof notificationSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Notification = mongoose.model('Notification', notificationSchema);
