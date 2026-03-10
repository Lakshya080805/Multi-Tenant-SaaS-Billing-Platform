import express from 'express';
import { body } from 'express-validator';
import { clientController } from '../../controllers/clientController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRole } from '../../middleware/roleMiddleware.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { validateRequest } from '../../middleware/validationMiddleware.js';

export const clientRouter = express.Router();

/**
 * @swagger
 * tags:
 *   name: Clients
 *   description: Client management
 */

clientRouter.use(authenticate);

/**
 * @swagger
 * /v1/clients:
 *   post:
 *     summary: Create a new client
 *     description: "🔒 Requires ADMIN role"
 *     tags: [Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       201:
 *         description: Client created
 *       403:
 *         description: Forbidden
 */
clientRouter.post(
  '/',
  requireRole('admin'),
  [body('name').isString().notEmpty()],
  validateRequest,
  asyncHandler(clientController.createClient)
);

/**
 * @swagger
 * /v1/clients:
 *   get:
 *     summary: Get all clients
 *     description: "🔒 Requires ADMIN, ACCOUNTANT or VIEWER role"
 *     tags: [Clients]
 *     responses:
 *       200:
 *         description: List of clients
 */
clientRouter.get('/', requireRole('admin', 'accountant', 'viewer'), asyncHandler(clientController.getAllClients));

/**
 * @swagger
 * /v1/clients/{id}:
 *   get:
 *     summary: Get a client by ID
 *     description: "🔒 Requires ADMIN, ACCOUNTANT or VIEWER role"
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client data
 *       404:
 *         description: Client not found
 */
clientRouter.get('/:id', requireRole('admin', 'accountant', 'viewer'), asyncHandler(clientController.getClient));

/**
 * @swagger
 * /v1/clients/{id}:
 *   patch:
 *     summary: Update a client
 *     description: "🔒 Requires ADMIN role"
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *     responses:
 *       200:
 *         description: Client updated
 *       404:
 *         description: Client not found
 */
clientRouter.patch('/:id', requireRole('admin'), asyncHandler(clientController.updateClient));

/**
 * @swagger
 * /v1/clients/{id}:
 *   delete:
 *     summary: Delete a client
 *     description: "🔒 Requires ADMIN role"
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client deleted
 *       404:
 *         description: Client not found
 */
clientRouter.delete('/:id', requireRole('admin'), asyncHandler(clientController.deleteClient));

