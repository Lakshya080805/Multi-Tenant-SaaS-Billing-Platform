import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

export function errorHandler(err, req, res, next) {
  if (!err) {
    logger.error('Reached errorHandler with empty error');
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Unexpected error'
    });
  }

  const isMongooseValidation = err.name === 'ValidationError';
  const isKnown = err instanceof ApiError;
  const status = isKnown ? err.statusCode : isMongooseValidation ? StatusCodes.BAD_REQUEST : StatusCodes.INTERNAL_SERVER_ERROR;
  const message = isKnown ? err.message : isMongooseValidation ? Object.values(err.errors).map(e => e.message).join(', ') : 'Internal server error';

  logger.error(isKnown ? err.message : err, {
    statusCode: status,
    method: req.method,
    url: req.originalUrl,
    ...(err.stack ? { stack: err.stack } : {})
  });

  res.status(status).json({
    success: false,
    message,
    ...(isKnown && err.details ? { details: err.details } : undefined),
    ...(process.env.NODE_ENV !== 'production'
      ? { error: { message: err.message, stack: err.stack } }
      : {})
  });
}
