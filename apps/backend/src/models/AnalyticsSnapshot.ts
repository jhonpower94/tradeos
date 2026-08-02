import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const analyticsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true },
    winRate: Number,
    lossRate: Number,
    profitFactor: Number,
    sharpe: Number,
    drawdown: Number,
    netPnl: Number,
    tradeCount: Number,
    byStrategy: Schema.Types.Mixed,
  },
  { timestamps: true },
);

analyticsSchema.index({ userId: 1, date: 1 }, { unique: true });

export type AnalyticsDoc = InferSchemaType<typeof analyticsSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const AnalyticsSnapshot = mongoose.model('AnalyticsSnapshot', analyticsSchema);
