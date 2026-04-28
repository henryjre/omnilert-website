import { Router } from 'express';
import {
  createRewardRequestSchema,
  rejectRewardRequestSchema,
  PERMISSIONS,
} from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as controller from '../controllers/reward.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/grouped-users', requirePermission(PERMISSIONS.REWARDS_ISSUE), controller.getGroupedUsers);
router.get('/', requirePermission(PERMISSIONS.REWARDS_VIEW), controller.listRewardRequests);
router.post('/', requirePermission(PERMISSIONS.REWARDS_ISSUE), validateBody(createRewardRequestSchema), controller.createRewardRequest);
router.get('/:id', requirePermission(PERMISSIONS.REWARDS_VIEW), controller.getRewardRequestDetail);
router.post('/:id/approve', requirePermission(PERMISSIONS.REWARDS_MANAGE), controller.approveRewardRequest);
router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.REWARDS_MANAGE),
  validateBody(rejectRewardRequestSchema),
  controller.rejectRewardRequest,
);

export default router;
