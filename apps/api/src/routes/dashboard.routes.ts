import { Router } from 'express';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requireAnyPermission, requirePermission } from '../middleware/rbac.js';
import * as dashboardController from '../controllers/dashboard.controller.js';
import * as payrollAdjustmentController from '../controllers/payrollAdjustment.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/performance-index',
  dashboardController.getPerformanceIndex,
);

router.get(
  '/check-in-status',
  dashboardController.getCheckInStatus,
);

router.get(
  '/payslip',
  dashboardController.getPayslip,
);

router.get(
  '/payslip-branches',
  dashboardController.getPayslipBranches,
);

router.get(
  '/payslips',
  dashboardController.getPayslipList,
);

router.get(
  '/payslips/branch-users',
  dashboardController.getPayslipBranchUsers,
);

router.get(
  '/payslips/:id',
  dashboardController.getPayslipDetail,
);

router.get(
  '/payroll-overview',
  requireAnyPermission(PERMISSIONS.PAYSLIPS_VIEW, PERMISSIONS.PAYSLIPS_MANAGE),
  dashboardController.getPayrollOverview,
);

router.post(
  '/payroll-overview/validate',
  requirePermission(PERMISSIONS.PAYSLIPS_MANAGE),
  dashboardController.validatePayrollOverviewAction,
);

router.get(
  '/payslip-adjustments',
  payrollAdjustmentController.listEmployeeAdjustments,
);

router.get(
  '/payslip-adjustments/:targetId',
  payrollAdjustmentController.getEmployeeAdjustmentDetail,
);

router.post(
  '/payslip-adjustments/:targetId/authorize',
  payrollAdjustmentController.authorizeEmployeeAdjustment,
);

router.get(
  '/epi-leaderboard',
  dashboardController.getEPILeaderboard,
);

router.get(
  '/epi',
  dashboardController.getEpiDashboardData,
);

router.get(
  '/epi/leaderboard',
  dashboardController.getEpiLeaderboardData,
);

router.get(
  '/epi/leaderboard/:userId',
  dashboardController.getEpiLeaderboardDetailData,
);

router.get(
  '/employee-analytics/metric-snapshots',
  dashboardController.getEmployeeMetricSnapshotsData,
);

router.get(
  '/employee-analytics/metric-events',
  dashboardController.getEmployeeMetricEventsData,
);

export default router;
