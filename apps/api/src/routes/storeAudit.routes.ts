import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as storeAuditController from '../controllers/storeAudit.controller.js';

const cssCriteriaScoresSchema = z.object({
  greeting: z.number().int().min(1).max(5),
  order_accuracy: z.number().int().min(1).max(5),
  suggestive_selling: z.number().int().min(1).max(5),
  service_efficiency: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5),
});

const cssCompleteSchema = z.object({
  criteria_scores: cssCriteriaScoresSchema,
  audit_log: z.string().min(1),
});

const complianceCompleteSchema = z.object({
  productivity_rate: z.boolean(),
  uniform: z.boolean(),
  hygiene: z.boolean(),
  sop: z.boolean(),
});

const completeAuditSchema = z.union([cssCompleteSchema, complianceCompleteSchema]);

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/', requirePermission(PERMISSIONS.STORE_AUDIT_VIEW), storeAuditController.list);
router.get('/:id', requirePermission(PERMISSIONS.STORE_AUDIT_VIEW), storeAuditController.getById);
router.post('/:id/process', requirePermission(PERMISSIONS.STORE_AUDIT_PROCESS), storeAuditController.processAudit);
router.post(
  '/:id/complete',
  requirePermission(PERMISSIONS.STORE_AUDIT_PROCESS),
  validateBody(completeAuditSchema),
  storeAuditController.completeAudit,
);

export default router;
