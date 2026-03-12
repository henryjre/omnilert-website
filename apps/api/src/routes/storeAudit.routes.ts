import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as storeAuditController from '../controllers/storeAudit.controller.js';

const cssCompleteSchema = z.object({
  star_rating: z.number().int().min(1).max(5),
  audit_log: z.string().min(1),
});

const complianceCompleteSchema = z.object({
  non_idle: z.boolean(),
  cellphone: z.boolean(),
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
