import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const backtestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    strategyId: { type: String, required: true },
    symbol: { type: String, required: true },
    interval: { type: String, required: true },
    startTime: Number,
    endTime: Number,
    initialCapital: Number,
    params: Schema.Types.Mixed,
    metrics: Schema.Types.Mixed,
    equityCurve: [{ t: Number, equity: Number }],
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    error: String,
  },
  { timestamps: true },
);

export type BacktestDoc = InferSchemaType<typeof backtestSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const BacktestRun = mongoose.model('BacktestRun', backtestSchema);
