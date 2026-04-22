import { Router } from 'express';
import {
  createPayrollAdjustmentRequestSchema,
  rejectPayrollAdjustmentSchema,
  updatePayrollAdjustmentProcessingSchema,
  PERMISSIONS,
} from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as controller from '../controllers/payrollAdjustment.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get(
  '/requests',
  requirePermission(PERMISSIONS.PAYSLIPS_VIEW),
  controller.listManagerRequests,
);
router.post(
  '/requests',
  requirePermission(PERMISSIONS.PAYSLIPS_ISSUE),
  validateBody(createPayrollAdjustmentRequestSchema),
  controller.createManagerRequest,
);
router.get(
  '/requests/:id',
  requirePermission(PERMISSIONS.PAYSLIPS_VIEW),
  controller.getManagerRequestDetail,
);
router.post(
  '/requests/:id/confirm',
  requirePermission(PERMISSIONS.PAYSLIPS_MANAGE),
  controller.confirmManagerRequest,
);
router.patch(
  '/requests/:id/processing',
  requirePermission(PERMISSIONS.PAYSLIPS_MANAGE),
  validateBody(updatePayrollAdjustmentProcessingSchema),
  controller.updateProcessingRequest,
);
router.post(
  '/requests/:id/approve',
  requirePermission(PERMISSIONS.PAYSLIPS_MANAGE),
  controller.approveManagerRequest,
);
router.post(
  '/requests/:id/reject',
  requirePermission(PERMISSIONS.PAYSLIPS_MANAGE),
  validateBody(rejectPayrollAdjustmentSchema),
  controller.rejectManagerRequest,
);

export default router;
