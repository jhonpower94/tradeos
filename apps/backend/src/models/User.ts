import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    refreshTokenHash: { type: String },
    refreshTokenExpiresAt: { type: Date },
    totpSecretEnc: { type: String },
    totpEnabled: { type: Boolean, default: false },
    totpBackupHashes: { type: [String], default: [] },
  },
  { timestamps: true },
);

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = mongoose.model('User', userSchema);
