import { Router } from 'express';
import { PERMISSIONS, upsertDepartmentSchema } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as departmentController from '../controllers/department.controller.js';

const router = Router();

router.use(authenticate, resolveCompany, requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS));

router.get('/', departmentController.list);
router.get('/options/members', departmentController.listMemberOptions);
router.post('/', validateBody(upsertDepartmentSchema), departmentController.create);
router.put('/:id', validateBody(upsertDepartmentSchema), departmentController.update);

export default router;
