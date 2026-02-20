import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission, requireAnyPermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as authorizationRequestController from '../controllers/authorizationRequest.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/',
  requireAnyPermission(
    PERMISSIONS.AUTH_REQUEST_APPROVE_MANAGEMENT,
    PERMISSIONS.AUTH_REQUEST_VIEW_ALL,
    PERMISSIONS.AUTH_REQUEST_APPROVE_SERVICE_CREW,
  ),
  authorizationRequestController.list,
);

router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.AUTH_REQUEST_APPROVE_MANAGEMENT),
  authorizationRequestController.approve,
);

router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.AUTH_REQUEST_APPROVE_MANAGEMENT),
  authorizationRequestController.reject,
);

export default router;
