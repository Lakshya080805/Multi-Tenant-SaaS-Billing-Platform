import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const RefreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    hash: { type: String, required: true },
    revokedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// --- Auth token indexes ---
// 1. userId — single-user token lookups (also covered by field-level index: true above)
// 2. userId + revokedAt — covers isTokenValid and revokeUserTokens which always filter
//    by both fields; more selective than userId alone
RefreshTokenSchema.index({ userId: 1, revokedAt: 1 });

const RefreshToken =
  mongoose.models.RefreshToken || mongoose.model('RefreshToken', RefreshTokenSchema);

export const refreshTokenModel = {
  async storeToken({ userId, tokenId }) {
    const hash = await bcrypt.hash(tokenId, 10);
    await RefreshToken.create({
      userId,
      hash,
      revokedAt: null
    });
  },

  async isTokenValid({ userId, tokenId }) {
    const activeTokens = await RefreshToken.find({
      userId,
      revokedAt: null
    }).lean();

    for (const token of activeTokens) {
      const match = await bcrypt.compare(tokenId, token.hash);
      if (match) return true;
    }
    return false;
  },

  async revokeUserTokens(userId) {
    await RefreshToken.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
};

