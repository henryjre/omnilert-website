import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { PERMISSIONS, confirmRejectSchema, submitBreakdownSchema } from '@omnilert/shared';
import { validateBody } from '../middleware/validateRequest.js';
import * as posVerificationController from '../controllers/posVerification.controller.js';

// Use memory storage for S3 uploads
const storage = multer.memoryStorage();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/', requirePermission(PERMISSIONS.POS_VERIFICATION_VIEW), posVerificationController.list);
router.get('/:id', requirePermission(PERMISSIONS.POS_VERIFICATION_VIEW), posVerificationController.get);

router.post(
  '/:id/images',
  requirePermission(PERMISSIONS.POS_VERIFICATION_UPLOAD_IMAGE),
  upload.single('image'),
  posVerificationController.uploadImage,
);

router.post(
  '/:id/confirm',
  requirePermission(PERMISSIONS.POS_VERIFICATION_CONFIRM_REJECT),
  validateBody(confirmRejectSchema),
  posVerificationController.confirm,
);

router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.POS_VERIFICATION_CONFIRM_REJECT),
  validateBody(confirmRejectSchema),
  posVerificationController.reject,
);

router.put(
  '/:id/breakdown',
  requirePermission(PERMISSIONS.POS_VERIFICATION_UPLOAD_IMAGE),
  validateBody(submitBreakdownSchema),
  posVerificationController.submitBreakdown,
);

router.post(
  '/:id/audit',
  requirePermission(PERMISSIONS.POS_SESSION_AUDIT_COMPLETE),
  posVerificationController.auditVerification,
);

// Customer verification routes — no permission guard; server validates customer_user_id === user.sub
router.post('/:id/customer-verify', posVerificationController.customerVerify);
router.post('/:id/customer-reject', posVerificationController.customerReject);

export default router;
