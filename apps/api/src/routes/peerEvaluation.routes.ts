import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requireAnyPermission, requirePermission } from '../middleware/rbac.js';
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
  requireAnyPermission(PERMISSIONS.PEER_EVALUATION_VIEW, PERMISSIONS.PEER_EVALUATION_MANAGE),
  peerEvaluationController.getMyPending,
);
router.get(
  '/',
  requireAnyPermission(PERMISSIONS.PEER_EVALUATION_VIEW, PERMISSIONS.PEER_EVALUATION_MANAGE),
  peerEvaluationController.list,
);
router.get(
  '/:id',
  requireAnyPermission(PERMISSIONS.PEER_EVALUATION_VIEW, PERMISSIONS.PEER_EVALUATION_MANAGE),
  peerEvaluationController.getById,
);
router.post(
  '/:id/submit',
  requireAnyPermission(PERMISSIONS.PEER_EVALUATION_VIEW, PERMISSIONS.PEER_EVALUATION_MANAGE),
  validateBody(submitSchema),
  peerEvaluationController.submit,
);

export default router;
