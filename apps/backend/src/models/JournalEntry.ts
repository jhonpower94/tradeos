import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const journalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tradeId: { type: Schema.Types.ObjectId, ref: 'Trade', required: true },
    signalId: { type: Schema.Types.ObjectId, ref: 'Signal' },
    symbol: { type: String, required: true },
    side: { type: String, required: true },
    strategy: String,
    strategyIds: [String],
    indicators: Schema.Types.Mixed,
    patterns: Schema.Types.Mixed,
    entry: Number,
    exit: Number,
    qty: Number,
    profit: Number,
    loss: Number,
    pnl: Number,
    durationMs: Number,
    risk: Number,
    confidence: Number,
    riskReward: Number,
    entryReason: String,
    exitReason: String,
    timeframe: String,
    mode: String,
  },
  { timestamps: true },
);

export type JournalDoc = InferSchemaType<typeof journalSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const JournalEntry = mongoose.model('JournalEntry', journalSchema);
