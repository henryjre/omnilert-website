import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as branchController from '../controllers/branch.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/', branchController.list);
router.post('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_BRANCHES), branchController.create);
router.put('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_BRANCHES), branchController.update);
router.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_BRANCHES), branchController.remove);

export default router;
