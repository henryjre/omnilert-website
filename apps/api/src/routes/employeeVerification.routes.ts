import { Router } from 'express';
import {
  PERMISSIONS,
  approvePersonalInformationVerificationSchema,
  approveRegistrationRequestSchema,
  rejectVerificationSchema,
} from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as employeeVerificationController from '../controllers/employeeVerification.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW),
  employeeVerificationController.list,
);

router.post(
  '/registration/:id/approve',
  requirePermission(PERMISSIONS.REGISTRATION_APPROVE),
  validateBody(approveRegistrationRequestSchema),
  employeeVerificationController.approveRegistration,
);
router.post(
  '/registration/:id/reject',
  requirePermission(PERMISSIONS.REGISTRATION_APPROVE),
  validateBody(rejectVerificationSchema),
  employeeVerificationController.rejectRegistration,
);

router.get(
  '/registration/assignment-options',
  requirePermission(PERMISSIONS.REGISTRATION_APPROVE),
  employeeVerificationController.listRegistrationAssignmentOptions,
);

router.post(
  '/personal-information/:id/approve',
  requirePermission(PERMISSIONS.PERSONAL_INFORMATION_APPROVE),
  validateBody(approvePersonalInformationVerificationSchema),
  employeeVerificationController.approvePersonalInformation,
);
router.post(
  '/personal-information/:id/reject',
  requirePermission(PERMISSIONS.PERSONAL_INFORMATION_APPROVE),
  validateBody(rejectVerificationSchema),
  employeeVerificationController.rejectPersonalInformation,
);

router.post(
  '/employment-requirements/:id/approve',
  requirePermission(PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE),
  employeeVerificationController.approveEmploymentRequirement,
);
router.post(
  '/employment-requirements/:id/reject',
  requirePermission(PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE),
  validateBody(rejectVerificationSchema),
  employeeVerificationController.rejectEmploymentRequirement,
);

router.post(
  '/bank-information/:id/approve',
  requirePermission(PERMISSIONS.BANK_INFORMATION_APPROVE),
  employeeVerificationController.approveBankInformation,
);
router.post(
  '/bank-information/:id/reject',
  requirePermission(PERMISSIONS.BANK_INFORMATION_APPROVE),
  validateBody(rejectVerificationSchema),
  employeeVerificationController.rejectBankInformation,
);

export default router;
