import { Router } from 'express';
import {
  createCompanyBySuperAdminSchema,
  updateCompanySchema,
  deleteCurrentCompanySchema,
  deleteCompanyByIdSchema,
  superAdminBootstrapSchema,
  superAdminLoginSchema,
  PERMISSIONS,
} from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateSuperAdmin } from '../middleware/superAdminAuth.js';
import { requirePermission } from '../middleware/rbac.js';
import * as companyController from '../controllers/company.controller.js';
import * as superAdminController from '../controllers/superAdmin.controller.js';
import * as branchController from '../controllers/branch.controller.js';
import multer from 'multer';

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const router = Router();

// Public - list companies (for login dropdown)
router.get('/companies', companyController.listPublic);
// Authenticated admin - list all companies
router.get('/companies/all', authenticate, companyController.list);
router.post(
  '/bootstrap',
  validateBody(superAdminBootstrapSchema),
  superAdminController.bootstrap,
);
router.post('/auth/login', validateBody(superAdminLoginSchema), superAdminController.login);
router.get('/auth/me', authenticateSuperAdmin, superAdminController.me);
router.get('/companies/current', authenticate, companyController.getCurrent);
router.put(
  '/companies/current',
  authenticate,
  validateBody(updateCompanySchema),
  companyController.updateCurrent,
);
router.post(
  '/companies/current/delete',
  authenticate,
  validateBody(deleteCurrentCompanySchema),
  companyController.deleteCurrent,
);

// Protected - company management (requires admin permission)
router.post(
  '/companies',
  authenticateSuperAdmin,
  validateBody(createCompanyBySuperAdminSchema),
  companyController.createBySuperAdmin,
);
router.get(
  '/companies/:id',
  authenticateSuperAdmin,
  companyController.get,
);
router.put(
  '/companies/:id',
  authenticateSuperAdmin,
  validateBody(updateCompanySchema),
  companyController.update,
);
// Admin-accessible update (no super admin token needed)
router.put(
  '/companies/:id/update',
  authenticate,
  validateBody(updateCompanySchema),
  companyController.updateByAdmin,
);
// Super admin delete by ID
router.post(
  '/companies/:id/delete',
  authenticateSuperAdmin,
  validateBody(deleteCompanyByIdSchema),
  companyController.deleteById,
);

// Admin-accessible logo upload
router.post(
  '/companies/:id/logo',
  authenticate,
  logoUpload.single('logo'),
  companyController.uploadLogo,
);

// Admin-accessible branch management per company
router.get('/companies/:companyId/branches', authenticate, branchController.superList);
router.post('/companies/:companyId/branches', authenticate, requirePermission(PERMISSIONS.ADMIN_MANAGE_COMPANIES), branchController.superCreate);
router.put('/companies/:companyId/branches/:branchId', authenticate, requirePermission(PERMISSIONS.ADMIN_MANAGE_COMPANIES), branchController.superUpdate);
router.delete('/companies/:companyId/branches/:branchId', authenticate, requirePermission(PERMISSIONS.ADMIN_MANAGE_COMPANIES), branchController.superRemove);

export default router;
