import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/performance-index',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW_PERFORMANCE_INDEX),
  dashboardController.getPerformanceIndex,
);

router.get(
  '/payslip',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW_PAYSLIP),
  dashboardController.getPayslip,
);

router.get(
  '/payslip-branches',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW_PAYSLIP),
  dashboardController.getPayslipBranches,
);

router.get(
  '/epi-leaderboard',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW_PERFORMANCE_INDEX),
  dashboardController.getEPILeaderboard,
);

export default router;
