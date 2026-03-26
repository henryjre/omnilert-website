import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS } from '@omnilert/shared';
import * as cashRequestController from '../controllers/cashRequest.controller.js';
import * as accountController from '../controllers/account.controller.js';

// Use memory storage for S3 uploads
const storage = multer.memoryStorage();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image or PDF files are allowed'));
    }
  },
});

const router = Router();

router.use(authenticate, resolveCompany);

// Approver: list all cash requests
router.get(
  '/',
  requirePermission(PERMISSIONS.CASH_REQUESTS_VIEW),
  cashRequestController.list,
);

// Approver: get single cash request
router.get(
  '/:id',
  requirePermission(PERMISSIONS.CASH_REQUESTS_VIEW),
  cashRequestController.getById,
);

// Approver: approve / reject
router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.CASH_REQUESTS_MANAGE),
  cashRequestController.approve,
);
router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.CASH_REQUESTS_MANAGE),
  cashRequestController.reject,
);
router.post(
  '/:id/disburse',
  requirePermission(PERMISSIONS.CASH_REQUESTS_MANAGE),
  cashRequestController.disburse,
);

export default router;
