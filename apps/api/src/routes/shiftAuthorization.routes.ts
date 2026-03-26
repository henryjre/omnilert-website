import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as shiftAuthorizationController from '../controllers/shiftAuthorization.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

/** Employee submits reason for tardiness / late_check_out */
router.post(
  '/:id/reason',
  requirePermission(PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE),
  shiftAuthorizationController.submitReason,
);

/** Manager approves an authorization */
router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC),
  shiftAuthorizationController.approve,
);

/** Manager rejects an authorization */
router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC),
  shiftAuthorizationController.reject,
);

export default router;
