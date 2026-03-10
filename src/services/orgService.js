import { organizationModel } from '../models/organizationModel.js';
import { userModel } from '../models/userModel.js';

export const orgService = {
  async listOrganizations() {
    return organizationModel.findAll();
  },

  async createOrganization(payload) {
    return organizationModel.create(payload);
  },

  async getOrganizationById(id) {
    return organizationModel.findById(id);
  },

  async listOrganizationUsers(orgId) {
    return userModel.findByOrganizationId(orgId);
  }
};
