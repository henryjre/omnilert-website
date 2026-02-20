import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as employeeShiftController from '../controllers/employeeShift.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/', requirePermission(PERMISSIONS.SHIFT_VIEW_ALL), employeeShiftController.list);
router.get('/:id', requirePermission(PERMISSIONS.SHIFT_VIEW_ALL), employeeShiftController.get);
router.post('/:id/end', requirePermission(PERMISSIONS.SHIFT_END_SHIFT), employeeShiftController.endShift);

export default router;
