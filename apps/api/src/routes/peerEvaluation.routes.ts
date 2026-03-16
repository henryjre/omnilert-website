import { Router } from 'express';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import * as peerEvaluationController from '../controllers/peerEvaluation.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

// IMPORTANT: static routes before /:id
router.get('/pending-mine', peerEvaluationController.getMyPending);
router.get('/', requirePermission(PERMISSIONS.PEER_EVALUATION_VIEW), peerEvaluationController.list);
router.get('/:id', requirePermission(PERMISSIONS.PEER_EVALUATION_VIEW), peerEvaluationController.getById);
router.post('/:id/submit', peerEvaluationController.submit);

export default router;
