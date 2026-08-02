import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const paperLedgerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['deposit', 'withdraw'], required: true },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String },
  },
  { timestamps: true },
);

paperLedgerSchema.index({ userId: 1, createdAt: -1 });

export type PaperLedgerDoc = InferSchemaType<typeof paperLedgerSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const PaperLedger = mongoose.model('PaperLedger', paperLedgerSchema);
