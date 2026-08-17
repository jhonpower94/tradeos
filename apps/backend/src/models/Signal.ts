import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { Side, SignalStatus, Timeframe } from '@trading-os/shared';

const signalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbol: { type: String, required: true, index: true },
    timeframe: { type: String, enum: Object.values(Timeframe), required: true },
    side: { type: String, enum: Object.values(Side), required: true },
    confidence: { type: Number, required: true },
    entry: { type: Number, required: true },
    stopLoss: { type: Number, required: true },
    takeProfit: { type: Number, required: true },
    riskReward: { type: Number, required: true },
    strategyIds: [String],
    primaryStrategy: String,
    evidence: [{ source: String, label: String, weight: Number, detail: String }],
    consensusSnapshot: Schema.Types.Mixed,
    regime: String,
    estimatedDuration: String,
    rank: Number,
    entryTiming: { type: String, enum: ['early', 'confirmed', 'mixed'] },
    relativeStrength: Number,
    stage: { type: String, enum: ['watching', 'triggered'] },
    locations: [{ type: { type: String }, price: Number, distanceAtr: Number, bullish: Boolean }],
    status: {
      type: String,
      enum: Object.values(SignalStatus),
      default: SignalStatus.RANKED,
      index: true,
    },
    rejectReason: String,
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true },
);

signalSchema.index({ userId: 1, status: 1, confidence: -1 });
signalSchema.index({ userId: 1, status: 1, createdAt: -1 });
signalSchema.index({ userId: 1, symbol: 1, timeframe: 1, side: 1, status: 1 });

export type SignalDoc = InferSchemaType<typeof signalSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Signal = mongoose.model('Signal', signalSchema);
