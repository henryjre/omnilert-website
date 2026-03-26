import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requireAnyPermission, requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as employeeShiftController from '../controllers/employeeShift.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/', requirePermission(PERMISSIONS.SCHEDULE_VIEW), employeeShiftController.list);
router.get('/:id', requirePermission(PERMISSIONS.SCHEDULE_VIEW), employeeShiftController.get);
router.post(
  '/:id/end',
  requireAnyPermission(
    PERMISSIONS.SCHEDULE_MANAGE_SHIFT,
    PERMISSIONS.SCHEDULE_END_SHIFT,
    PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC,
    PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE,
  ),
  employeeShiftController.endShift,
);

export default router;
