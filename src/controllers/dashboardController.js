import { StatusCodes } from 'http-status-codes';
import {
  getDashboardStats,
  getMonthlyRevenue,
  getInvoiceStatusStats,
  getTopClientsByRevenue,
  getRecentInvoices,
  getMonthlyGrowth,
  getAverageInvoiceValue,
  getClientLifetimeValue
} from '../services/dashboardService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const dashboardController = {
  async getSummary(req, res, next) {
    try {
      const { organizationId } = req.user;
      const stats = await getDashboardStats(organizationId);
      sendSuccess(res, StatusCodes.OK, stats);
    } catch (err) {
      next(err);
    }
  },

  async getRevenue(req, res, next) {
    try {
      const { organizationId } = req.user;
      const revenue = await getMonthlyRevenue(organizationId);
      sendSuccess(res, StatusCodes.OK, revenue);
    } catch (err) {
      next(err);
    }
  },

  async getInvoiceStatus(req, res, next) {
    try {
      const { organizationId } = req.user;
      const statusStats = await getInvoiceStatusStats(organizationId);
      sendSuccess(res, StatusCodes.OK, statusStats);
    } catch (err) {
      next(err);
    }
  },

  async getTopClients(req, res, next) {
    try {
      const { organizationId } = req.user;
      const topClients = await getTopClientsByRevenue(organizationId);
      sendSuccess(res, StatusCodes.OK, topClients);
    } catch (err) {
      next(err);
    }
  },

  async getRecentInvoices(req, res, next) {
    try {
      const { organizationId } = req.user;
      const invoices = await getRecentInvoices(organizationId);
      sendSuccess(res, StatusCodes.OK, invoices);
    } catch (err) {
      next(err);
    }
  },

  async getMonthlyGrowth(req, res, next) {
    try {
      const { organizationId } = req.user;
      const growth = await getMonthlyGrowth(organizationId);
      sendSuccess(res, StatusCodes.OK, growth);
    } catch (err) {
      next(err);
    }
  },

  async getAverageInvoiceValue(req, res, next) {
    try {
      const { organizationId } = req.user;
      const data = await getAverageInvoiceValue(organizationId);
      sendSuccess(res, StatusCodes.OK, data);
    } catch (err) {
      next(err);
    }
  },

  async getClientLifetimeValue(req, res, next) {
    try {
      const { organizationId } = req.user;
      const data = await getClientLifetimeValue(organizationId);
      sendSuccess(res, StatusCodes.OK, data);
    } catch (err) {
      next(err);
    }
  }
};
