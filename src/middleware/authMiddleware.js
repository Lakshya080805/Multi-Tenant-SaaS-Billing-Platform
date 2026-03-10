import { jwtUtils } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';
import { userModel } from '../models/userModel.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Authentication required');
    }

    let payload;
    try {
      payload = jwtUtils.verifyAccessToken(token);
    } catch (e) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid or expired token');
    }

    const user = await userModel.findById(payload.sub);
    if (!user) {
      throw new ApiError(StatusCodes.UNAUTHORIZED, 'User not found');
    }

    if (!user.organizationId || !payload.org) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Organization context missing');
    }

    const orgIdFromToken = String(payload.org);
    const orgIdFromUser = String(user.organizationId);

    if (orgIdFromToken !== orgIdFromUser) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Organization mismatch');
    }

    const orgIdFromRequest =
      (req.params && req.params.orgId) ||
      (req.body && req.body.organizationId) ||
      (req.query && req.query.organizationId) ||
      null;

    if (orgIdFromRequest && String(orgIdFromRequest) !== orgIdFromToken) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Cross-organization access denied');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId
    };

    next();
  } catch (err) {
    next(err);
  }
}
