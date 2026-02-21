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
import * as employeeVerificationController from '../controllers/employeeVerification.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW),
  employeeVerificationController.listRegistrationOnly,
);

router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.REGISTRATION_APPROVE),
  validateBody(approveRegistrationRequestSchema),
  employeeVerificationController.approveRegistration,
);

router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.REGISTRATION_APPROVE),
  validateBody(rejectVerificationSchema),
  employeeVerificationController.rejectRegistration,
);

export default router;
