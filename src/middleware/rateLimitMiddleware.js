import rateLimit from 'express-rate-limit';
import { StatusCodes } from 'http-status-codes';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,  // Return RateLimit-* headers
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(StatusCodes.TOO_MANY_REQUESTS).json({
      success: false,
      message: 'Too many requests, please try again later.'
    });
  }
});
