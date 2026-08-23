import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const authTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['password_reset'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
  },
  { timestamps: true },
);

authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthTokenDoc = InferSchemaType<typeof authTokenSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const AuthToken = mongoose.model('AuthToken', authTokenSchema);
