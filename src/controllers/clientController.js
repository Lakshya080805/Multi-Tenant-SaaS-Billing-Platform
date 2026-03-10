import { StatusCodes } from 'http-status-codes';
import { clientService } from '../services/clientService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const clientController = {
  createClient: async (req, res) => {
    const organizationId = req.user.organizationId;
    const client = await clientService.createClient(req.body, organizationId);
    sendSuccess(res, StatusCodes.CREATED, client);
  },

  getAllClients: async (req, res) => {
    const organizationId = req.user.organizationId;
    const clients = await clientService.getAllClients(organizationId);
    sendSuccess(res, StatusCodes.OK, clients);
  },

  getClient: async (req, res) => {
    const organizationId = req.user.organizationId;
    const client = await clientService.getClientById(req.params.id, organizationId);
    sendSuccess(res, StatusCodes.OK, client);
  },

  updateClient: async (req, res) => {
    const organizationId = req.user.organizationId;
    const client = await clientService.updateClient(req.params.id, req.body, organizationId);
    sendSuccess(res, StatusCodes.OK, client);
  },

  deleteClient: async (req, res) => {
    const organizationId = req.user.organizationId;
    await clientService.deleteClient(req.params.id, organizationId);
    sendSuccess(res, StatusCodes.NO_CONTENT, null);
  }
};

