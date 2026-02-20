import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS, createRoleSchema, updateRoleSchema, assignPermissionsSchema } from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import * as roleController from '../controllers/role.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/', roleController.list);
router.post(
  '/',
  requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES),
  validateBody(createRoleSchema),
  roleController.create,
);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES),
  validateBody(updateRoleSchema),
  roleController.update,
);
router.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES), roleController.remove);

router.get('/:id/permissions', requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES), roleController.getPermissions);
router.put(
  '/:id/permissions',
  requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES),
  validateBody(assignPermissionsSchema),
  roleController.setPermissions,
);

export default router;
