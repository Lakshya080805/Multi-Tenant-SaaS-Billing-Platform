import mongoose from 'mongoose';

const OrganizationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    stripeCustomerId: { type: String, default: null }
  },
  { timestamps: true }
);

const Organization =
  mongoose.models.Organization || mongoose.model('Organization', OrganizationSchema);

export const organizationModel = {
  async create(org) {
    const doc = await Organization.create(org);
    return doc.toObject();
  },

  async findAll() {
    return Organization.find({}).lean();
  },

  async findById(id) {
    return Organization.findOne({ id }).lean();
  }
};
