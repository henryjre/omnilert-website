import { Router } from 'express';
import { PERMISSIONS, updateEmployeeWorkInformationSchema } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as employeeProfileController from '../controllers/employeeProfile.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES),
  employeeProfileController.list,
);
router.get(
  '/:userId',
  requirePermission(PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES),
  employeeProfileController.detail,
);
router.patch(
  '/:userId/work-information',
  requirePermission(PERMISSIONS.EMPLOYEE_EDIT_WORK_PROFILE),
  validateBody(updateEmployeeWorkInformationSchema),
  employeeProfileController.updateWorkInformation,
);

export default router;
