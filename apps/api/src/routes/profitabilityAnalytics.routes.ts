import { Router } from 'express';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import * as profitabilityAnalyticsController from '../controllers/profitabilityAnalytics.controller.js';

const router = Router();

router.use(
  authenticate,
  requirePermission(PERMISSIONS.ANALYTICS_VIEW_PROFITABILITY_ANALYTICS),
);

router.get('/', profitabilityAnalyticsController.getData);

export default router;

