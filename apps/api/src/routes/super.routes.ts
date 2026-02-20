import { Router } from 'express';
import {
  createCompanyBySuperAdminSchema,
  updateCompanySchema,
  superAdminBootstrapSchema,
  superAdminLoginSchema,
} from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import { authenticate } from '../middleware/auth.js';
import { authenticateSuperAdmin } from '../middleware/superAdminAuth.js';
import * as companyController from '../controllers/company.controller.js';
import * as superAdminController from '../controllers/superAdmin.controller.js';

const router = Router();

// Public - list companies (for login dropdown)
router.get('/companies', companyController.listPublic);
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

export default router;
