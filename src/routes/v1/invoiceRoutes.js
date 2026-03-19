import express from 'express';
import { body } from 'express-validator';
import { invoiceController } from '../../controllers/invoiceController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRole } from '../../middleware/roleMiddleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validateRequest } from '../../middleware/validationMiddleware.js';

export const invoiceRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Invoices
 *   description: Invoice management
 */

invoiceRouter.use(authenticate);

/**
 * @swagger
 * /v1/invoices:
 *   post:
 *     summary: Create a new invoice
 *     description: "🔒 Requires ADMIN or ACCOUNTANT role"
 *     tags: [Invoices]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, invoiceNumber]
 *             properties:
 *               clientId:
 *                 type: string
 *                 example: "304a8550-634e-451f-9c09-f8a5ae1af119"
 *               invoiceNumber:
 *                 type: string
 *                 example: "INV-001"
 *               issueDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-09"
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-09"
 *               lineItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [quantity, unitPrice, taxRate]
 *                   properties:
 *                     description:
 *                       type: string
 *                       example: "Web development services"
 *                     quantity:
 *                       type: number
 *                       example: 5
 *                     unitPrice:
 *                       type: number
 *                       example: 500
 *                     taxRate:
 *                       type: number
 *                       example: 18
 *                       description: Tax rate percentage (e.g. 18 for 18%)
 *     responses:
 *       201:
 *         description: Invoice created
 */
invoiceRouter.post(
  '/',
  requireRole('admin', 'accountant'),
  [
    body('clientId').isString().notEmpty(),
    body('invoiceNumber').isString().notEmpty(),
    body('lineItems').isArray().optional()
  ],
  validateRequest,
  asyncHandler(invoiceController.createInvoice)
);

/**
 * @swagger
 * /v1/invoices:
 *   get:
 *     summary: Get all invoices
 *     description: "🔒 Requires ADMIN, ACCOUNTANT or VIEWER role"
 *     tags: [Invoices]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, sent, paid, overdue]
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of invoices
 */
invoiceRouter.get('/', requireRole('admin', 'accountant', 'viewer'), asyncHandler(invoiceController.getAllInvoices));

/**
 * @swagger
 * /v1/invoices/{id}:
 *   get:
 *     summary: Get an invoice by ID
 *     description: "🔒 Requires ADMIN, ACCOUNTANT or VIEWER role"
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice data
 *       404:
 *         description: Invoice not found
 */
invoiceRouter.get('/:id', requireRole('admin', 'accountant', 'viewer'), asyncHandler(invoiceController.getInvoice));

/**
 * @swagger
 * /v1/invoices/{id}:
 *   patch:
 *     summary: Update an invoice
 *     description: "🔒 Requires ADMIN or ACCOUNTANT role"
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [draft, sent, paid, overdue]
 *               lineItems:
 *                 type: array
 *               dueDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Invoice updated
 */
invoiceRouter.patch('/:id', requireRole('admin', 'accountant'), asyncHandler(invoiceController.updateInvoice));

/**
 * @swagger
 * /v1/invoices/{id}:
 *   delete:
 *     summary: Delete an invoice
 *     description: "🔒 Requires ADMIN role"
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice deleted
 */
invoiceRouter.delete('/:id', requireRole('admin'), asyncHandler(invoiceController.deleteInvoice));

/**
 * @swagger
 * /v1/invoices/{id}/pdf:
 *   get:
 *     summary: Download invoice as PDF
 *     description: "🔒 Requires ADMIN, ACCOUNTANT or VIEWER role"
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 */
invoiceRouter.get('/:id/pdf', requireRole('admin', 'accountant', 'viewer'), asyncHandler(invoiceController.downloadInvoicePdf));

/**
 * @swagger
 * /v1/invoices/{id}/send:
 *   post:
 *     summary: Send invoice via email to the client
 *     description: "🔒 Requires ADMIN or ACCOUNTANT role"
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice sent successfully
 */
invoiceRouter.post('/:id/send', requireRole('admin', 'accountant'), asyncHandler(invoiceController.sendInvoiceEmail));

