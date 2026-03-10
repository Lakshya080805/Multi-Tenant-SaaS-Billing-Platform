import { v4 as uuid } from 'uuid';
import { clientModel } from '../models/clientModel.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

export const clientService = {
  async createClient(data, organizationId) {
    const payload = {
      id: uuid(),
      organizationId,
      name: data.name,
      email: data.email,
      company: data.company,
      billingAddress: data.billingAddress,
      taxId: data.taxId,
      notes: data.notes
    };

    return clientModel.create(payload);
  },

  async getClientById(id, organizationId) {
    const client = await clientModel.findById(id);
    if (!client || client.organizationId !== organizationId) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Client not found');
    }
    return client;
  },

  async getAllClients(organizationId) {
    return clientModel.findByOrganization(organizationId);
  },

  async updateClient(id, data, organizationId) {
    const existing = await this.getClientById(id, organizationId);

    const updated = await clientModel.updateById(id, {
      name: data.name ?? existing.name,
      email: data.email ?? existing.email,
      company: data.company ?? existing.company,
      billingAddress: data.billingAddress ?? existing.billingAddress,
      taxId: data.taxId ?? existing.taxId,
      notes: data.notes ?? existing.notes
    });

    if (!updated || updated.organizationId !== organizationId) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Client not found');
    }

    return updated;
  },

  async deleteClient(id, organizationId) {
    const client = await this.getClientById(id, organizationId);
    await clientModel.deleteById(client.id);
  }
};

