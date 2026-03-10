import { StatusCodes } from 'http-status-codes';

export function notFoundHandler(req, res, next) {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: 'Route not found'
  });
}
