import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import * as dashboardController from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/performance-index',
  dashboardController.getPerformanceIndex,
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
  '/payslips/:id',
  dashboardController.getPayslipDetail,
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

export default router;
