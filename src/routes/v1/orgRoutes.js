import express from 'express';
import { orgController } from '../../controllers/orgController.js';
import { authenticate } from '../../middleware/authMiddleware.js';
import { requireRole } from '../../middleware/roleMiddleware.js';
import { withOrganization } from '../../middleware/orgMiddleware.js';

export const orgRouter = express.Router();

orgRouter.use(authenticate, withOrganization);

orgRouter.get('/', requireRole('SUPER_ADMIN'), orgController.listOrganizations);
orgRouter.post('/', requireRole('SUPER_ADMIN'), orgController.createOrganization);

orgRouter.get('/current', orgController.getCurrentOrganization);
orgRouter.get('/:orgId/users', requireRole('ORG_ADMIN'), orgController.listOrganizationUsers);
