import { Router } from 'express';
import multer from 'multer';
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
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.use(authenticate, resolveCompany);

router.get(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE),
  employeeVerificationController.list,
);

router.post(
  '/registration/:id/avatar',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION),
  imageUpload.single('avatar'),
  employeeVerificationController.uploadRegistrationAvatar,
);
router.post(
  '/registration/:id/approve',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION),
  validateBody(approveRegistrationRequestSchema),
  employeeVerificationController.approveRegistration,
);
router.post(
  '/registration/:id/reject',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION),
  validateBody(rejectVerificationSchema),
  employeeVerificationController.rejectRegistration,
);

router.get(
  '/registration/assignment-options',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION),
  employeeVerificationController.listRegistrationAssignmentOptions,
);

router.post(
  '/personal-information/:id/approve',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_PERSONAL),
  validateBody(approvePersonalInformationVerificationSchema),
  employeeVerificationController.approvePersonalInformation,
);
router.post(
  '/personal-information/:id/reject',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_PERSONAL),
  validateBody(rejectVerificationSchema),
  employeeVerificationController.rejectPersonalInformation,
);

router.post(
  '/employment-requirements/:id/approve',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS),
  employeeVerificationController.approveEmploymentRequirement,
);
router.post(
  '/employment-requirements/:id/reject',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS),
  validateBody(rejectVerificationSchema),
  employeeVerificationController.rejectEmploymentRequirement,
);

router.post(
  '/bank-information/:id/approve',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_BANK),
  employeeVerificationController.approveBankInformation,
);
router.post(
  '/bank-information/:id/reject',
  requirePermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_BANK),
  validateBody(rejectVerificationSchema),
  employeeVerificationController.rejectBankInformation,
);

export default router;
