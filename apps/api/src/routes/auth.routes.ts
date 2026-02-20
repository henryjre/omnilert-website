import { Router } from 'express';
import { loginSchema, refreshTokenSchema } from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

// Tenant auth
router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', validateBody(refreshTokenSchema), authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export default router;
