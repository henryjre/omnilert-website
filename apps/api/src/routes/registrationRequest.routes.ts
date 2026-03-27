import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import {
  approveRegistrationRequestSchema,
  rejectVerificationSchema,
  PERMISSIONS,
} from '@omnilert/shared';
import * as registrationRequestController from '../controllers/registrationRequest.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE),
  registrationRequestController.list,
);

router.get(
  '/assignment-options',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION),
  registrationRequestController.listAssignmentOptions,
);

router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION),
  validateBody(approveRegistrationRequestSchema),
  registrationRequestController.approve,
);

router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION),
  validateBody(rejectVerificationSchema),
  registrationRequestController.reject,
);

export default router;
