import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { OrderType, Side, TradeStatus, TradingMode } from '@trading-os/shared';

const tradeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    signalId: { type: Schema.Types.ObjectId, ref: 'Signal' },
    mode: { type: String, enum: Object.values(TradingMode), required: true },
    symbol: { type: String, required: true },
    side: { type: String, enum: Object.values(Side), required: true },
    orderType: { type: String, enum: Object.values(OrderType), default: OrderType.MARKET },
    qty: { type: Number, required: true },
    entryPrice: { type: Number },
    exitPrice: { type: Number },
    stopLoss: Number,
    takeProfit: Number,
    trailingStopPct: Number,
    status: {
      type: String,
      enum: Object.values(TradeStatus),
      default: TradeStatus.PENDING,
      index: true,
    },
    binanceOrderIds: [String],
    fees: { type: Number, default: 0 },
    realizedPnl: { type: Number, default: 0 },
    entryReason: String,
    exitReason: String,
    openedAt: Date,
    closedAt: Date,
  },
  { timestamps: true },
);

export type TradeDoc = InferSchemaType<typeof tradeSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const Trade = mongoose.model('Trade', tradeSchema);
