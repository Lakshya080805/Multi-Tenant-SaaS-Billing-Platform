import express from 'express';
import { body } from 'express-validator';
import { authController } from '../../controllers/authController.js';
import { validateRequest } from '../../middleware/validationMiddleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { authRateLimiter, registrationRateLimiter } from '../../middleware/rateLimitMiddleware.js';

export const authRouter = express.Router();

authRouter.use(authRateLimiter);

// Apply high-limit rate limiter only to registration endpoint
authRouter.post('/register', registrationRateLimiter, authController.register);

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication endpoints
 */

/**
 * @swagger
 * /v1/auth/register:
 *   post:
 *     summary: Register a new user and organization
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, organizationName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               organizationName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, accountant, viewer]
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post(
  '/register',
  [
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('organizationName').isString().notEmpty(),
    body('role').optional().isIn(['admin', 'accountant', 'viewer'])
  ],
  validateRequest,
  asyncHandler(authController.register)
);

/**
 * @swagger
 * /v1/auth/login:
 *   post:
 *     summary: Login and receive JWT tokens
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
authRouter.post(
  '/login',
  [body('email').isEmail(), body('password').isString().notEmpty()],
  validateRequest,
  asyncHandler(authController.login)
);

/**
 * @swagger
 * /v1/auth/refresh-token:
 *   post:
 *     summary: Refresh the access token using a refresh token
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Invalid or expired refresh token
 */
authRouter.post('/refresh-token', asyncHandler(authController.refreshToken));

/**
 * @swagger
 * /v1/auth/logout:
 *   post:
 *     summary: Logout and revoke refresh token
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
authRouter.post('/logout', asyncHandler(authController.logout));
