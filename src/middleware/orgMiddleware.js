import { organizationModel } from '../models/organizationModel.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

export async function withOrganization(req, res, next) {
  try {
    if (!req.user || !req.user.organizationId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Organization context missing');
    }
    const org = await organizationModel.findById(req.user.organizationId);
    if (!org) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Organization not found');
    }
    req.organization = org;
    next();
  } catch (err) {
    next(err);
  }
}
