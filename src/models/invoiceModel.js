import mongoose from 'mongoose';

const InvoiceLineItemSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    organizationId: { type: String, required: true},
    clientId: { type: String, required: true },
    invoiceNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
      default: 'draft'
    },
    issueDate: { type: Date },
    dueDate: { type: Date },
    lineItems: { type: [InvoiceLineItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    notes: { type: String, trim: true },
    sentAt: { type: Date, default: null },
    paidAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// --- Analytics & multi-tenant indexes ---
// 1. Tenant isolation — base filter used by every query
InvoiceSchema.index({ organizationId: 1 });

// 2. Invoice status analytics (getInvoiceStatusStats, getInvoiceStats)
InvoiceSchema.index({ organizationId: 1, status: 1 });

// 3. Monthly revenue analytics — sparse so null paidAt docs are excluded (getMonthlyRevenue)
InvoiceSchema.index({ organizationId: 1, paidAt: 1 }, { sparse: true });

// 4. Top clients / client lifetime value — covers $group on clientId after status match
InvoiceSchema.index({ organizationId: 1, clientId: 1, status: 1 });

// 5. Overdue invoice cron job — filters sent invoices by dueDate
InvoiceSchema.index({ organizationId: 1, dueDate: 1 });

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);

export const invoiceModel = {
  async create(payload) {
    const doc = await Invoice.create(payload);
    return doc.toObject();
  },

  // async findById(id) {
  //   return Invoice.findOne({ id }).lean();
  // },

  async findById(id, organizationId) {
    return Invoice.findOne({ id, organizationId }).lean();
  },

  async findByOrganization(organizationId, pagination = {}) {
    const page = Math.max(Number.parseInt(pagination.page, 10) || 1, 1);
    const pageSize = Math.min(
      Math.max(Number.parseInt(pagination.pageSize, 10) || 20, 1),
      100
    );
    const skip = (page - 1) * pageSize;

    return Invoice.find({ organizationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean();
  },

  // async updateById(id, update) {
  //   return Invoice.findOneAndUpdate({ id }, update, { new: true }).lean();
  // },

  async updateById(id, organizationId, update, options = {}) {
    return Invoice.findOneAndUpdate(
      { id, organizationId },
      update,
      { new: true, ...options }
    ).lean();
  },

  // async deleteById(id) {
  //   return Invoice.deleteOne({ id });
  // }

  async deleteById(id, organizationId) {
    return Invoice.deleteOne({ id, organizationId });
  },

  async markOverdue() {
    return Invoice.updateMany(
      { status: 'sent', dueDate: { $lt: new Date() } },
      { $set: { status: 'overdue' } }
    );
  }
};

