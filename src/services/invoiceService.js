import { v4 as uuid } from 'uuid';
import { invoiceModel } from '../models/invoiceModel.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

import { clientModel } from '../models/clientModel.js';

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
      currency: data.currency || 'USD',
      notes: data.notes
    };

    return invoiceModel.create(payload);
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

  async getAllInvoices(organizationId) {
    return invoiceModel.findByOrganization(organizationId);
  },

  async updateInvoice(id, data, organizationId) {
    const existing = await this.getInvoiceById(id, organizationId);

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
      notes: data.notes ?? existing.notes
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

    return updated;
  },

  async deleteInvoice(id, organizationId) {
    const deleted = await invoiceModel.deleteById(id, organizationId);

if (!deleted.deletedCount) {
  throw new ApiError(StatusCodes.NOT_FOUND, 'Invoice not found');
}

    const invoice = await this.getInvoiceById(id, organizationId);
    await invoiceModel.deleteById(invoice.id);
  }
};


