import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requireAnyPermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as employeeRequirementController from '../controllers/employeeRequirement.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);
router.use(requireAnyPermission(
  PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS,
  PERMISSIONS.SCHEDULE_VIEW,
));

router.get('/', employeeRequirementController.list);
router.get('/:userId', employeeRequirementController.getDetail);

export default router;
