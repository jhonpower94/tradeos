import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { STRATEGY_IDS } from '@trading-os/shared';

const strategyDefSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, enum: STRATEGY_IDS },
    name: { type: String, required: true },
    description: { type: String, required: true },
    defaultParams: { type: Schema.Types.Mixed, default: {} },
    enabledByDefault: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type StrategyDefDoc = InferSchemaType<typeof strategyDefSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const StrategyDef = mongoose.model('StrategyDef', strategyDefSchema);
