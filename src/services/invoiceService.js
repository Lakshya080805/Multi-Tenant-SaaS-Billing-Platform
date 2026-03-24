import { v4 as uuid } from 'uuid';
import { invoiceModel } from '../models/invoiceModel.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

import { clientModel } from '../models/clientModel.js';
import { getOrSetCache, keyBuilders, invalidateInvoiceRelatedCache } from './cacheService.js';

const ALLOWED_STATUS_TRANSITIONS = {
  draft: ['sent', 'cancelled'],
  sent: ['paid', 'overdue', 'cancelled'],
  paid: [],
  overdue: ['paid', 'cancelled'],
  cancelled: []
};

function validateStatusTransition(existing, data) {
  if (existing.status === 'paid') {
    const attemptedChange = Object.keys(data || {}).length > 0;
    if (attemptedChange) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Paid invoice cannot be modified'
      );
    }
    return;
  }

  if (existing.status === 'cancelled') {
    const attemptedChange = Object.keys(data || {}).length > 0;
    if (attemptedChange) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        'Cancelled invoice cannot be modified'
      );
    }
    return;
  }

  if (!data.status || data.status === existing.status) {
    return;
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(data.status)) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Invalid invoice status transition from ${existing.status} to ${data.status}`
    );
  }

  if (existing.status === 'overdue' && data.status === 'paid' && !data.paidAt) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      'paidAt is required to mark an overdue invoice as paid'
    );
  }
}

export const invoiceService = {
  calculateInvoiceTotals(lineItems) {
    let subtotal = 0;
    let taxTotal = 0;

    for (const item of lineItems || []) {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const taxRate = Number(item.taxRate) || 0;

      const lineTotal = quantity * unitPrice;
      const lineTax = (lineTotal * taxRate) / 100;

      subtotal += lineTotal;
      taxTotal += lineTax;
    }

    const total = subtotal + taxTotal;

    return {
      subtotal,
      taxTotal,
      total
    };
  },

  async createInvoice(data, organizationId) {

    const client = await clientModel.findById(data.clientId);
    if (!client || client.organizationId !== organizationId) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Client not found');
    }

    const lineItems = data.lineItems || [];
    const { subtotal, taxTotal, total } = this.calculateInvoiceTotals(lineItems);

    const payload = {
      id: uuid(),
      organizationId,
      clientId: data.clientId,
      invoiceNumber: data.invoiceNumber,
      status: data.status || 'draft',
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      lineItems,
      subtotal,
      taxTotal,
      total,
      currency: data.currency || 'INR',
      notes: data.notes
    };

    const created = await invoiceModel.create(payload);
    
    // Invalidate invoice-related cache after creation
    await invalidateInvoiceRelatedCache(organizationId, { action: 'createInvoice' });
    
    return created;
  },

  // async getInvoiceById(id, organizationId) {
  //   const invoice = await invoiceModel.findById(id);
  //   if (!invoice || invoice.organizationId !== organizationId) {
  //     throw new ApiError(StatusCodes.NOT_FOUND, 'Invoice not found');
  //   }
  //   return invoice;
  // },

  async getInvoiceById(id, organizationId) {
    const invoice = await invoiceModel.findById(id, organizationId);
  
    if (!invoice) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Invoice not found');
    }
  
    return invoice;
  },

  async getAllInvoices(organizationId, pagination = {}) {
    const allowedStatuses = new Set(['draft', 'sent', 'paid', 'overdue', 'cancelled']);

    if (pagination.status && !allowedStatuses.has(pagination.status)) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Invalid status filter');
    }

    const cacheFilters = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: pagination.status,
      clientId: pagination.clientId
    };

    const cacheKey = keyBuilders.invoiceList(organizationId, cacheFilters);

    return getOrSetCache(
      cacheKey,
      () => invoiceModel.findByOrganization(organizationId, pagination),
      {
        ttlSeconds: 90,
        logContext: {
          domain: 'invoices',
          organizationId
        }
      }
    );
  },

  async updateInvoice(id, data, organizationId) {
    const existing = await this.getInvoiceById(id, organizationId);

    validateStatusTransition(existing, data);

    const lineItems = data.lineItems ?? existing.lineItems ?? [];
    const { subtotal, taxTotal, total } = this.calculateInvoiceTotals(lineItems);

    if (data.clientId) {
      const client = await clientModel.findById(data.clientId);
    
      if (!client || client.organizationId !== organizationId) {
        throw new ApiError(StatusCodes.NOT_FOUND, 'Client not found');
      }
    }

    const update = {
      clientId: data.clientId ?? existing.clientId,
      invoiceNumber: data.invoiceNumber ?? existing.invoiceNumber,
      status: data.status ?? existing.status,
      issueDate: data.issueDate ?? existing.issueDate,
      dueDate: data.dueDate ?? existing.dueDate,
      lineItems,
      subtotal,
      taxTotal,
      total,
      currency: data.currency ?? existing.currency,
      notes: data.notes ?? existing.notes,
      sentAt: data.sentAt ?? existing.sentAt,
      paidAt:
        data.paidAt ??
        (data.status === 'paid' && !existing.paidAt ? new Date() : existing.paidAt)
    };

    // const updated = await invoiceModel.updateById(id, update);

    // if (!updated || updated.organizationId !== organizationId) {
    //   throw new ApiError(StatusCodes.NOT_FOUND, 'Invoice not found');
    // }

    const updated = await invoiceModel.updateById(
      id,
      organizationId,
      update
    );
    
    if (!updated) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Invoice not found');
    }

    // Invalidate invoice-related cache after update
    await invalidateInvoiceRelatedCache(organizationId, { action: 'updateInvoice', invoiceId: id });

    return updated;
  },

  async deleteInvoice(id, organizationId) {
    const existing = await this.getInvoiceById(id, organizationId);

    if (existing.status === 'paid') {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Paid invoice cannot be deleted');
    }

    const deleted = await invoiceModel.deleteById(id, organizationId);

    if (!deleted.deletedCount) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Invoice not found');
    }

    // Invalidate invoice-related cache after deletion
    await invalidateInvoiceRelatedCache(organizationId, { action: 'deleteInvoice', invoiceId: id });
  }
};


