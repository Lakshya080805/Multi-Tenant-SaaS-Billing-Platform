import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true, index: true },
    invoiceId: { type: String, required: true, index: true },

    razorpayOrderId: { type: String, trim: true },
    razorpayPaymentId: { type: String, trim: true },
    razorpaySignature: { type: String, trim: true },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed'],
      default: 'pending'
    },
    provider: { type: String, default: 'mock' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// --- Multi-tenant & payment lookup indexes ---
// 1. organizationId — tenant isolation (also covered by field-level index: true above)
// 2. invoiceId — single-invoice payment history lookup (also covered above)
// 3. organizationId + invoiceId — covers findByInvoice scoped to a tenant in one index scan
PaymentSchema.index({ organizationId: 1, invoiceId: 1 });

const Payment = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);

export const paymentModel = {
  async create(payload) {
    const doc = await Payment.create(payload);
    return doc.toObject();
  },

  async findById(id) {
    return Payment.findOne({ id }).lean();
  },

  async findByRazorpayOrderId(razorpayOrderId) {
    return Payment.findOne({ razorpayOrderId }).lean();
  },

  async findByInvoice(invoiceId, organizationId) {
    const query = organizationId
      ? { invoiceId, organizationId }
      : { invoiceId };
    return Payment.find(query).lean();
  },

  async findByOrganization(organizationId) {
    return Payment.find({ organizationId }).lean();
  },

  async updateById(id, update) {
    return Payment.findOneAndUpdate({ id }, update, { new: true }).lean();
  },

  async updateByRazorpayOrderId(razorpayOrderId, update) {
    return Payment.findOneAndUpdate(
      { razorpayOrderId },
      update,
      { new: true }
    ).lean();
  },

  async updateLatestByInvoice(invoiceId, organizationId, update) {
    return Payment.findOneAndUpdate(
      { invoiceId, organizationId },
      update,
      { new: true, sort: { createdAt: -1 } }
    ).lean();
  }
};

