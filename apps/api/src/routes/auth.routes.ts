import { Router } from 'express';
import { loginSchema, refreshTokenSchema, registerRequestSchema, switchCompanySchema } from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

// Tenant auth
router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', validateBody(refreshTokenSchema), authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.get('/companies', authenticate, authController.listCompanies);
router.post('/switch-company', authenticate, validateBody(switchCompanySchema), authController.switchCompany);
router.post('/register-request', validateBody(registerRequestSchema), authController.registerRequest);

export default router;
