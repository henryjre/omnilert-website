import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as peerEvaluationController from '../controllers/peerEvaluation.controller.js';

const submitSchema = z.object({
  q1_score: z.number().int().min(1).max(5),
  q2_score: z.number().int().min(1).max(5),
  q3_score: z.number().int().min(1).max(5),
  additional_message: z.string().max(1000).optional(),
});

const router = Router();

router.use(authenticate, resolveCompany);

// IMPORTANT: static routes before /:id
router.get(
  '/pending-mine',
  requirePermission(PERMISSIONS.WORKPLACE_RELATIONS_VIEW),
  peerEvaluationController.getMyPending,
);
router.get(
  '/',
  requirePermission(PERMISSIONS.WORKPLACE_RELATIONS_VIEW),
  peerEvaluationController.list,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.WORKPLACE_RELATIONS_VIEW),
  peerEvaluationController.getById,
);
router.post(
  '/:id/submit',
  requirePermission(PERMISSIONS.WORKPLACE_RELATIONS_VIEW),
  validateBody(submitSchema),
  peerEvaluationController.submit,
);

export default router;
