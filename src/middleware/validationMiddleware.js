import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';
import { StatusCodes } from 'http-status-codes';

export function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Validation failed', errors.array());
  }
  next();
}
