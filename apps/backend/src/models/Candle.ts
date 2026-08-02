import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const candleSchema = new Schema(
  {
    symbol: { type: String, required: true },
    interval: { type: String, required: true },
    openTime: { type: Number, required: true },
    open: Number,
    high: Number,
    low: Number,
    close: Number,
    volume: Number,
    closeTime: Number,
  },
  { timestamps: false },
);

candleSchema.index({ symbol: 1, interval: 1, openTime: 1 }, { unique: true });

export type CandleDoc = InferSchemaType<typeof candleSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const CandleModel = mongoose.model('Candle', candleSchema);
