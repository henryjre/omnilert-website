import { Router } from 'express';
import authRoutes from './auth.routes.js';
import superRoutes from './super.routes.js';
import branchRoutes from './branch.routes.js';
import roleRoutes from './role.routes.js';
import userRoutes from './user.routes.js';
import posVerificationRoutes from './posVerification.routes.js';
import posSessionRoutes from './posSession.routes.js';
import employeeShiftRoutes from './employeeShift.routes.js';
import webhookRoutes from './webhook.routes.js';
import accountRoutes from './account.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import shiftAuthorizationRoutes from './shiftAuthorization.routes.js';
import authorizationRequestRoutes from './authorizationRequest.routes.js';
import cashRequestRoutes from './cashRequest.routes.js';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
router.use('/auth', authRoutes);

// Super admin routes
router.use('/super', superRoutes);

// Company-scoped routes
router.use('/branches', branchRoutes);
router.use('/roles', roleRoutes);
router.use('/permissions', authenticate, resolveCompany, requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES), (_req, res, next) => {
  import('../controllers/role.controller.js').then(m => m.listAllPermissions(_req, res, next));
});
router.use('/users', userRoutes);
router.use('/pos-verifications', posVerificationRoutes);
router.use('/pos-sessions', posSessionRoutes);
router.use('/employee-shifts', employeeShiftRoutes);
router.use('/shift-authorizations', shiftAuthorizationRoutes);
router.use('/authorization-requests', authorizationRequestRoutes);
router.use('/cash-requests', cashRequestRoutes);
router.use('/account', accountRoutes);
router.use('/dashboard', dashboardRoutes);

// Webhooks (no JWT)
router.use('/webhooks', webhookRoutes);

export default router;
