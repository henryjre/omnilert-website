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
import * as tokenPayController from '../controllers/tokenPay.controller.js';

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
  requirePermission(PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST),
  accountController.getAuthorizationRequests,
);
router.get(
  '/authorization-requests/:id',
  requirePermission(PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST),
  accountController.getAuthorizationRequestById,
);
router.post(
  '/authorization-requests',
  requirePermission(PERMISSIONS.ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST),
  accountController.createAuthorizationRequest,
);

router.get(
  '/cash-requests',
  requirePermission(PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST),
  accountController.getCashRequests,
);
router.get(
  '/cash-requests/:id',
  requirePermission(PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST),
  accountController.getCashRequestById,
);
router.get(
  '/audit-results',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS),
  accountController.getAuditResults,
);
router.get(
  '/audit-results/:id',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS),
  accountController.getAuditResultById,
);
router.post(
  '/cash-requests',
  requirePermission(PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST),
  upload.single('attachment'),
  accountController.createCashRequest,
);

router.post(
  '/personal-information/verifications',
  validateBody(submitPersonalInformationVerificationSchema),
  accountController.submitPersonalInformationVerification,
);

router.get(
  '/profile',
  accountController.getProfile,
);

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

router.get(
  '/employment/requirements',
  requirePermission(PERMISSIONS.ACCOUNT_MANAGE_EMPLOYEE_REQUIREMENTS),
  accountController.getEmploymentRequirements,
);
router.post(
  '/employment/requirements/:requirementCode/submit',
  requirePermission(PERMISSIONS.ACCOUNT_MANAGE_EMPLOYEE_REQUIREMENTS),
  upload.single('document'),
  accountController.submitEmploymentRequirement,
);

router.get(
  '/notifications',
  accountController.getNotifications,
);
router.get(
  '/notifications/count',
  accountController.getNotificationCount,
);
router.put(
  '/notifications/read-all',
  accountController.markAllNotificationsRead,
);
router.put(
  '/notifications/:id/read',
  accountController.markNotificationRead,
);
router.get('/push/config', accountController.getPushConfig);
router.get('/push/preferences', accountController.getPushPreferences);
router.patch('/push/preferences', accountController.updatePushPreferences);
router.post('/push/subscriptions', accountController.upsertPushSubscription);
router.delete('/push/subscriptions', accountController.removePushSubscription);

router.get(
  '/shift-authorizations/:id',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE),
  accountController.getShiftAuthorizationById,
);

// Token Pay wallet and transaction history
router.get('/token-pay/wallet', requirePermission(PERMISSIONS.ACCOUNT_VIEW_TOKEN_PAY), tokenPayController.getWallet);
router.get('/token-pay/transactions', requirePermission(PERMISSIONS.ACCOUNT_VIEW_TOKEN_PAY), tokenPayController.getTransactions);

// Token pay verification — customer fetches their own verification details
router.get('/token-pay/:id', accountController.getTokenPayVerification);

export default router;
