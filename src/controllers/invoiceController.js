import { StatusCodes } from 'http-status-codes';
import { invoiceService } from '../services/invoiceService.js';
import { clientModel } from '../models/clientModel.js';
import { organizationModel } from '../models/organizationModel.js';
import { generateInvoicePdf } from '../services/pdfService.js';
import { sendInvoiceEmail } from '../services/emailService.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const invoiceController = {
  createInvoice: async (req, res) => {
    const organizationId = req.user.organizationId;
    const invoice = await invoiceService.createInvoice(req.body, organizationId);
    sendSuccess(res, StatusCodes.CREATED, invoice);
  },

  getAllInvoices: async (req, res) => {
    const organizationId = req.user.organizationId;
    const { page, pageSize, status, clientId } = req.query;
    const invoices = await invoiceService.getAllInvoices(organizationId, {
      page,
      pageSize,
      status,
      clientId
    });
    sendSuccess(res, StatusCodes.OK, invoices);
  },

  getInvoice: async (req, res) => {
    const organizationId = req.user.organizationId;
    const invoice = await invoiceService.getInvoiceById(req.params.id, organizationId);
    sendSuccess(res, StatusCodes.OK, invoice);
  },

  updateInvoice: async (req, res) => {
    const organizationId = req.user.organizationId;
    const invoice = await invoiceService.updateInvoice(req.params.id, req.body, organizationId);
    sendSuccess(res, StatusCodes.OK, invoice);
  },

  deleteInvoice: async (req, res) => {
    const organizationId = req.user.organizationId;
    await invoiceService.deleteInvoice(req.params.id, organizationId);
    sendSuccess(res, StatusCodes.NO_CONTENT, null);
  },

  downloadInvoicePdf: async (req, res) => {
    const organizationId = req.user.organizationId;

    const invoice = await invoiceService.getInvoiceById(req.params.id, organizationId);

    const client = await clientModel.findById(invoice.clientId);
    if (!client || client.organizationId !== organizationId) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Client not found');
    }

    const organization = await organizationModel.findById(organizationId);
    if (!organization) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Organization not found');
    }

    const pdfBuffer = await generateInvoicePdf(invoice, client, organization);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`
    );
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  },

  sendInvoiceEmail: async (req, res) => {
    const organizationId = req.user.organizationId;

    const invoice = await invoiceService.getInvoiceById(req.params.id, organizationId);

    const client = await clientModel.findById(invoice.clientId);
    if (!client || client.organizationId !== organizationId) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Client not found');
    }

    if (!client.email) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Client does not have an email address');
    }

    const organization = await organizationModel.findById(organizationId);
    if (!organization) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Organization not found');
    }

    const pdfBuffer = await generateInvoicePdf(invoice, client, organization);

    await sendInvoiceEmail(
      client.email,
      `Invoice ${invoice.invoiceNumber}`,
      `Please find attached invoice ${invoice.invoiceNumber} from ${organization.name}.`,
      pdfBuffer,
      `invoice-${invoice.invoiceNumber}.pdf`
    );

    await invoiceService.updateInvoice(
      invoice.id,
      { status: invoice.status === 'draft' ? 'sent' : invoice.status, sentAt: new Date() },
      organizationId
    );

    sendSuccess(res, StatusCodes.OK, { message: 'Invoice email sent successfully' });
  }
};

