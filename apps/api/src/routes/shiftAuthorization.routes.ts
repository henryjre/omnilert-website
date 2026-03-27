import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requireAnyPermission, requirePermission } from '../middleware/rbac.js';
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
  requireAnyPermission(
    PERMISSIONS.SCHEDULE_MANAGE_SHIFT,
    PERMISSIONS.SCHEDULE_END_SHIFT,
    PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC,
  ),
  shiftAuthorizationController.approve,
);

/** Manager rejects an authorization */
router.post(
  '/:id/reject',
  requireAnyPermission(
    PERMISSIONS.SCHEDULE_MANAGE_SHIFT,
    PERMISSIONS.SCHEDULE_END_SHIFT,
    PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC,
  ),
  shiftAuthorizationController.reject,
);

export default router;
