import { Router } from 'express';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import * as posAnalyticsController from '../controllers/posAnalytics.controller.js';

const router = Router();

router.use(
  authenticate,
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_POS_ANALYTICS),
);

router.get('/', posAnalyticsController.getData);

export default router;
