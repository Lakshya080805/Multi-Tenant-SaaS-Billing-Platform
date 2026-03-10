import express from 'express';
import { dashboardController } from '../../controllers/dashboardController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const dashboardRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Analytics and statistics
 */

dashboardRouter.use(authenticate);

/**
 * @swagger
 * /v1/dashboard/summary:
 *   get:
 *     summary: Get overall business summary
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Summary stats
 */
/**
 * @swagger
 * /v1/dashboard/revenue:
 *   get:
 *     summary: Get revenue data
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Revenue breakdown
 */
/**
 * @swagger
 * /v1/dashboard/invoice-status:
 *   get:
 *     summary: Get invoice status distribution
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Invoice status counts
 */
/**
 * @swagger
 * /v1/dashboard/top-clients:
 *   get:
 *     summary: Get top clients by revenue
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: List of top clients
 */
/**
 * @swagger
 * /v1/dashboard/recent-invoices:
 *   get:
 *     summary: Get recently created invoices
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Recent invoices
 */
/**
 * @swagger
 * /v1/dashboard/monthly-growth:
 *   get:
 *     summary: Get monthly revenue growth
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Monthly growth data
 */
/**
 * @swagger
 * /v1/dashboard/average-invoice-value:
 *   get:
 *     summary: Get average invoice value
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Average invoice value
 */
/**
 * @swagger
 * /v1/dashboard/client-lifetime-value:
 *   get:
 *     summary: Get client lifetime value stats
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Client lifetime value data
 */
dashboardRouter.get('/summary',         asyncHandler(dashboardController.getSummary));
dashboardRouter.get('/revenue',         asyncHandler(dashboardController.getRevenue));
dashboardRouter.get('/invoice-status',  asyncHandler(dashboardController.getInvoiceStatus));
dashboardRouter.get('/top-clients',     asyncHandler(dashboardController.getTopClients));
dashboardRouter.get('/recent-invoices',        asyncHandler(dashboardController.getRecentInvoices));
dashboardRouter.get('/monthly-growth',         asyncHandler(dashboardController.getMonthlyGrowth));
dashboardRouter.get('/average-invoice-value',  asyncHandler(dashboardController.getAverageInvoiceValue));
dashboardRouter.get('/client-lifetime-value',  asyncHandler(dashboardController.getClientLifetimeValue));
