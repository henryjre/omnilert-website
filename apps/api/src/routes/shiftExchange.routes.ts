import { Router } from 'express';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import * as shiftExchangeController from '../controllers/shiftExchange.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/options',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE),
  shiftExchangeController.listOptions,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE),
  shiftExchangeController.create,
);
router.get(
  '/:id',
  shiftExchangeController.detail,
);
router.post(
  '/:id/respond',
  shiftExchangeController.respond,
);
router.post(
  '/:id/approve',
  shiftExchangeController.approve,
);
router.post(
  '/:id/reject',
  shiftExchangeController.reject,
);

export default router;
