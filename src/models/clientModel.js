import mongoose from 'mongoose';

const ClientSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    company: { type: String, trim: true },
    billingAddress: { type: String, trim: true },
    taxId: { type: String, trim: true },
    notes: { type: String, trim: true }
  },
  { timestamps: true }
);

ClientSchema.index({ organizationId: 1, email: 1 });

// --- Analytics & multi-tenant indexes ---
// 1. Tenant isolation — base filter used by every client query
ClientSchema.index({ organizationId: 1 });

// 2. Monthly growth analytics — covers $group on createdAt scoped per tenant
ClientSchema.index({ organizationId: 1, createdAt: 1 });

const Client = mongoose.models.Client || mongoose.model('Client', ClientSchema);

export const clientModel = {
  async create(payload) {
    const doc = await Client.create(payload);
    return doc.toObject();
  },

  async findById(id) {
    return Client.findOne({ id }).lean();
  },

  async findByOrganization(organizationId) {
    return Client.find({ organizationId }).lean();
  },

  async findByOrganizationAndEmail(organizationId, email) {
    return Client.findOne({ organizationId, email: String(email).toLowerCase() }).lean();
  },

  async updateById(id, update) {
    return Client.findOneAndUpdate({ id }, update, { new: true }).lean();
  },

  async deleteById(id) {
    return Client.deleteOne({ id });
  }
};

