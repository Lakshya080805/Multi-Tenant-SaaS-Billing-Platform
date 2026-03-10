import { StatusCodes } from 'http-status-codes';
import { orgService } from '../services/orgService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const orgController = {
  async listOrganizations(req, res, next) {
    try {
      const orgs = await orgService.listOrganizations();
      sendSuccess(res, StatusCodes.OK, orgs);
    } catch (err) {
      next(err);
    }
  },

  async createOrganization(req, res, next) {
    try {
      const org = await orgService.createOrganization(req.body);
      sendSuccess(res, StatusCodes.CREATED, org);
    } catch (err) {
      next(err);
    }
  },

  async getCurrentOrganization(req, res, next) {
    try {
      const org = await orgService.getOrganizationById(req.organization.id);
      sendSuccess(res, StatusCodes.OK, org);
    } catch (err) {
      next(err);
    }
  },

  async listOrganizationUsers(req, res, next) {
    try {
      const users = await orgService.listOrganizationUsers(req.params.orgId);
      sendSuccess(res, StatusCodes.OK, users);
    } catch (err) {
      next(err);
    }
  }
};
