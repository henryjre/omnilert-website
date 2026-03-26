import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as authorizationRequestController from '../controllers/authorizationRequest.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/',
  requirePermission(PERMISSIONS.AUTH_REQUEST_VIEW_PAGE),
  authorizationRequestController.list,
);

router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.AUTH_REQUEST_MANAGE_PRIVATE),
  authorizationRequestController.approve,
);

router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.AUTH_REQUEST_MANAGE_PRIVATE),
  authorizationRequestController.reject,
);

export default router;
