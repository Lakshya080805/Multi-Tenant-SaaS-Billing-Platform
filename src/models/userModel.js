import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: ['admin', 'accountant', 'viewer'] },
    organizationId: { type: String, required: true, index: true }
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export const userModel = {
  async create(user) {
    const doc = await User.create({
      ...user,
      email: String(user.email).toLowerCase()
    });
    return doc.toObject();
  },

  async findByEmail(email) {
    return User.findOne({ email: String(email).toLowerCase() }).lean();
  },

  async findById(id) {
    return User.findOne({ id }).select('-passwordHash').lean();
  },

  async findByOrganizationId(orgId) {
    return User.find({ organizationId: orgId }).select('-passwordHash').lean();
  }
};
