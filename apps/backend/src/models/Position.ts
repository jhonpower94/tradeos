import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { PositionStatus, Side } from '@trading-os/shared';

const positionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tradeId: { type: Schema.Types.ObjectId, ref: 'Trade', required: true },
    symbol: { type: String, required: true },
    side: { type: String, enum: Object.values(Side), required: true },
    qty: { type: Number, required: true },
    entryPrice: { type: Number, required: true },
    currentPrice: { type: Number, required: true },
    unrealizedPnl: { type: Number, default: 0 },
    stopLoss: Number,
    takeProfit: Number,
    initialStopLoss: Number,
    trailingStopPct: Number,
    trailingStopPrice: Number,
    highestPrice: Number,
    lowestPrice: Number,
    partialTpDone: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(PositionStatus),
      default: PositionStatus.OPEN,
      index: true,
    },
    openedAt: { type: Date, default: Date.now },
    closedAt: Date,
  },
  { timestamps: true },
);

positionSchema.index({ userId: 1, status: 1 });

export type PositionDoc = InferSchemaType<typeof positionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Position = mongoose.model('Position', positionSchema);
