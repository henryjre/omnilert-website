import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import {
  PERMISSIONS,
  assignRolesSchema,
  assignUserCompanyAssignmentsSchema,
  createUserSchema,
  updateUserSchema,
  changeMyPasswordSchema,
} from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import * as userController from '../controllers/user.controller.js';

const router = Router();

// Memory storage for avatar uploads
const storage = multer.memoryStorage();
const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.use(authenticate, resolveCompany);

router.get('/me', userController.getMe);
router.put('/me', userController.updateMe);
router.post('/me/password', validateBody(changeMyPasswordSchema), userController.changeMyPassword);
router.get('/me/pin', userController.getPin);
router.post('/me/pin', userController.setPin);
router.post('/me/avatar', avatarUpload.single('avatar'), userController.uploadAvatar);

router.get('/', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), userController.list);
router.get('/assignment-options', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), userController.assignmentOptions);
router.post(
  '/',
  requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS),
  validateBody(createUserSchema),
  userController.create,
);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS),
  validateBody(updateUserSchema),
  userController.update,
);
router.delete('/:id', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), userController.remove);
router.delete('/:id/permanent', requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS), userController.destroy);

router.put(
  '/:id/roles',
  requirePermission(PERMISSIONS.ADMIN_MANAGE_ROLES),
  validateBody(assignRolesSchema),
  userController.assignRoles,
);
router.put(
  '/:id/branches',
  requirePermission(PERMISSIONS.ADMIN_MANAGE_USERS),
  validateBody(assignUserCompanyAssignmentsSchema),
  userController.assignBranches,
);

export default router;
