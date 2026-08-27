import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { Side } from '@trading-os/shared';

const symbolSuppressionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    symbol: { type: String, required: true },
    losingSide: { type: String, enum: Object.values(Side), required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

symbolSuppressionSchema.index({ userId: 1, symbol: 1 }, { unique: true });

export type SymbolSuppressionDoc = InferSchemaType<typeof symbolSuppressionSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const SymbolSuppression = mongoose.model('SymbolSuppression', symbolSuppressionSchema);
