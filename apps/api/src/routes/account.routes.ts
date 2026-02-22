import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import {
  PERMISSIONS,
  submitPersonalInformationVerificationSchema,
  submitBankInformationVerificationSchema,
  updateAccountEmailSchema,
} from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import * as accountController from '../controllers/account.controller.js';

// Use memory storage for S3 uploads
const storage = multer.memoryStorage();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/');
    const isPdf = file.mimetype === 'application/pdf';
    cb(null, isImage || isPdf);
  },
});

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/schedule',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE),
  accountController.getSchedule,
);
router.get(
  '/schedule-branches',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE),
  accountController.getScheduleBranches,
);
router.get(
  '/schedule/:id',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE),
  accountController.getScheduleShift,
);

router.get(
  '/authorization-requests',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_AUTH_REQUESTS),
  accountController.getAuthorizationRequests,
);
router.post(
  '/authorization-requests',
  requirePermission(PERMISSIONS.ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST),
  accountController.createAuthorizationRequest,
);

router.get(
  '/cash-requests',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_CASH_REQUESTS),
  accountController.getCashRequests,
);
router.post(
  '/cash-requests',
  requirePermission(PERMISSIONS.ACCOUNT_SUBMIT_CASH_REQUEST),
  upload.single('attachment'),
  accountController.createCashRequest,
);

router.post(
  '/personal-information/verifications',
  validateBody(submitPersonalInformationVerificationSchema),
  accountController.submitPersonalInformationVerification,
);

router.get('/profile', accountController.getProfile);

router.patch(
  '/email',
  validateBody(updateAccountEmailSchema),
  accountController.updateAccountEmail,
);

router.post(
  '/valid-id',
  upload.single('document'),
  accountController.uploadValidId,
);

router.post(
  '/bank-information/verifications',
  validateBody(submitBankInformationVerificationSchema),
  accountController.submitBankInformationVerification,
);

router.get('/employment/requirements', accountController.getEmploymentRequirements);
router.post(
  '/employment/requirements/:requirementCode/submit',
  upload.single('document'),
  accountController.submitEmploymentRequirement,
);

router.get(
  '/notifications',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_NOTIFICATIONS),
  accountController.getNotifications,
);
router.get('/notifications/count', accountController.getNotificationCount);
router.put('/notifications/read-all', accountController.markAllNotificationsRead);
router.put('/notifications/:id/read', accountController.markNotificationRead);

// Token pay verification — customer fetches their own verification details
router.get('/token-pay/:id', accountController.getTokenPayVerification);

export default router;
