import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as posSessionController from '../controllers/posSession.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/', requirePermission(PERMISSIONS.POS_SESSION_VIEW), posSessionController.list);
router.get('/:id', requirePermission(PERMISSIONS.POS_SESSION_VIEW), posSessionController.get);
router.post(
  '/:id/audit-complete',
  requirePermission(PERMISSIONS.POS_SESSION_AUDIT_COMPLETE),
  posSessionController.auditComplete,
);

export default router;
