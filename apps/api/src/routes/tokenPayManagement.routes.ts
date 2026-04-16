import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as controller from '../controllers/tokenPayManagement.controller.js';

const router = Router();

router.use(authenticate, resolveCompany);

// Order matters: specific routes before :userId param routes
router.get('/grouped-users', requirePermission(PERMISSIONS.TOKEN_PAY_ISSUE), controller.getGroupedUsers);
router.get('/issuances', requirePermission(PERMISSIONS.TOKEN_PAY_VIEW), controller.listIssuanceRequests);
router.post('/issuances', requirePermission(PERMISSIONS.TOKEN_PAY_ISSUE), controller.createIssuanceRequest);
router.post('/issuances/:id/approve', requirePermission(PERMISSIONS.TOKEN_PAY_MANAGE), controller.approveIssuance);
router.post('/issuances/:id/reject', requirePermission(PERMISSIONS.TOKEN_PAY_MANAGE), controller.rejectIssuance);
router.get('/', requirePermission(PERMISSIONS.TOKEN_PAY_VIEW), controller.listWallets);
router.get('/:userId', requirePermission(PERMISSIONS.TOKEN_PAY_VIEW), controller.getWalletDetail);
router.post('/:userId/suspend', requirePermission(PERMISSIONS.TOKEN_PAY_ACCOUNT_MANAGE), controller.suspendAccount);
router.post('/:userId/unsuspend', requirePermission(PERMISSIONS.TOKEN_PAY_ACCOUNT_MANAGE), controller.unsuspendAccount);

export default router;
