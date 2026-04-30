import { Router } from 'express';
import multer from 'multer';
import { loginSchema, refreshTokenSchema, switchCompanySchema } from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import { authenticate } from '../middleware/auth.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();
const registrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  },
});

// Tenant auth
router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', validateBody(refreshTokenSchema), authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.get('/companies', authenticate, authController.listCompanies);
router.post('/switch-company', authenticate, validateBody(switchCompanySchema), authController.switchCompany);
router.get('/public-config', authController.publicConfig);
router.post(
  '/register',
  registrationUpload.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'validId', maxCount: 1 },
  ]),
  authController.registerRequest,
);
router.post(
  '/register-request',
  registrationUpload.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'validId', maxCount: 1 },
  ]),
  authController.registerRequest,
);

export default router;
