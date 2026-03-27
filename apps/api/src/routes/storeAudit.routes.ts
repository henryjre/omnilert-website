import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { AppError } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as storeAuditController from '../controllers/storeAudit.controller.js';

const storage = multer.memoryStorage();
const MAX_MESSAGE_FILE_SIZE = 50 * 1024 * 1024;
const MAX_MESSAGE_FILE_COUNT = 10;

const messageUpload = multer({
  storage,
  limits: {
    fileSize: MAX_MESSAGE_FILE_SIZE,
    files: MAX_MESSAGE_FILE_COUNT,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
      return;
    }
    cb(new AppError(400, 'Only image and video attachments are allowed'));
  },
});

function parseMessageUpload(req: Request, res: Response, next: NextFunction): void {
  messageUpload.any()(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_COUNT') {
        next(new AppError(400, 'Maximum of 10 attachments is allowed per message'));
        return;
      }
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(400, 'Attachment exceeds 50MB limit'));
        return;
      }
    }

    next(error);
  });
}

const cssCriteriaScoresSchema = z.object({
  greeting: z.number().int().min(1).max(5),
  order_accuracy: z.number().int().min(1).max(5),
  suggestive_selling: z.number().int().min(1).max(5),
  service_efficiency: z.number().int().min(1).max(5),
  professionalism: z.number().int().min(1).max(5),
});

const cssCompleteSchema = z.object({
  criteria_scores: cssCriteriaScoresSchema,
});

const complianceCompleteSchema = z.object({
  productivity_rate: z.boolean(),
  uniform: z.boolean(),
  hygiene: z.boolean(),
  sop: z.boolean(),
});

const completeAuditSchema = z.union([cssCompleteSchema, complianceCompleteSchema]);
const editMessageSchema = z.object({
  content: z.string().trim().min(1),
});

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/', requirePermission(PERMISSIONS.STORE_AUDIT_VIEW), storeAuditController.list);
router.get('/:id', requirePermission(PERMISSIONS.STORE_AUDIT_VIEW), storeAuditController.getById);
router.get('/:id/messages', requirePermission(PERMISSIONS.STORE_AUDIT_VIEW), storeAuditController.listMessages);
router.post(
  '/:id/messages',
  requirePermission(PERMISSIONS.STORE_AUDIT_VIEW),
  parseMessageUpload,
  storeAuditController.sendMessage,
);
router.patch(
  '/:id/messages/:messageId',
  requirePermission(PERMISSIONS.STORE_AUDIT_VIEW),
  validateBody(editMessageSchema),
  storeAuditController.editMessage,
);
router.delete(
  '/:id/messages/:messageId',
  requirePermission(PERMISSIONS.STORE_AUDIT_VIEW),
  storeAuditController.deleteMessage,
);
router.post('/:id/process', requirePermission(PERMISSIONS.STORE_AUDIT_MANAGE), storeAuditController.processAudit);
router.post(
  '/:id/complete',
  requirePermission(PERMISSIONS.STORE_AUDIT_MANAGE),
  validateBody(completeAuditSchema),
  storeAuditController.completeAudit,
);

export default router;
