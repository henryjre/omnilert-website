import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as violationNoticeController from '../controllers/violationNotice.controller.js';

const storage = multer.memoryStorage();
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const pdfUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

const messageUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    cb(null, file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || allowed.includes(file.mimetype));
  },
});

const multerAny = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

const createVNSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  targetUserIds: z.array(z.string().uuid()).min(1),
});

const rejectSchema = z.object({
  rejectionReason: z.string().trim().min(1),
});

const fromCaseReportSchema = z.object({
  caseId: z.string().uuid(),
  description: z.string().trim().min(1).max(2000),
  targetUserIds: z.array(z.string().uuid()).min(1),
});

const fromStoreAuditSchema = z.object({
  auditId: z.string().uuid(),
  description: z.string().trim().min(1).max(2000),
  targetUserIds: z.array(z.string().uuid()).min(1),
});

const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(20),
});

const editMessageSchema = z.object({
  content: z.string().trim().min(1),
});

const router = Router();

router.use(authenticate, resolveCompany);

// Static paths before /:id
router.get('/grouped-users', requirePermission(PERMISSIONS.VIOLATION_NOTICE_CREATE), violationNoticeController.groupedUsers);
router.get('/mentionables', requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW), violationNoticeController.mentionables);
router.post(
  '/from-case-report',
  requirePermission(PERMISSIONS.VIOLATION_NOTICE_CREATE),
  validateBody(fromCaseReportSchema),
  violationNoticeController.createFromCaseReport,
);
router.post(
  '/from-store-audit',
  requirePermission(PERMISSIONS.VIOLATION_NOTICE_CREATE),
  validateBody(fromStoreAuditSchema),
  violationNoticeController.createFromStoreAudit,
);
router.get('/', requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW), violationNoticeController.list);
router.post('/', requirePermission(PERMISSIONS.VIOLATION_NOTICE_CREATE), validateBody(createVNSchema), violationNoticeController.create);

// /:id routes
router.get('/:id', requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW), violationNoticeController.getById);
router.post('/:id/confirm', requirePermission(PERMISSIONS.VIOLATION_NOTICE_CONFIRM), violationNoticeController.confirm);
router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.VIOLATION_NOTICE_REJECT),
  validateBody(rejectSchema),
  violationNoticeController.reject,
);
router.post('/:id/issue', requirePermission(PERMISSIONS.VIOLATION_NOTICE_ISSUE), violationNoticeController.issue);
router.post(
  '/:id/issuance-upload',
  requirePermission(PERMISSIONS.VIOLATION_NOTICE_ISSUE),
  pdfUpload.any(),
  violationNoticeController.uploadIssuanceFile,
);
router.post('/:id/confirm-issuance', requirePermission(PERMISSIONS.VIOLATION_NOTICE_ISSUE), violationNoticeController.confirmIssuance);
router.post(
  '/:id/disciplinary-upload',
  requirePermission(PERMISSIONS.VIOLATION_NOTICE_COMPLETE),
  multerAny.any(),
  violationNoticeController.uploadDisciplinaryFile,
);
router.post('/:id/complete', requirePermission(PERMISSIONS.VIOLATION_NOTICE_COMPLETE), violationNoticeController.complete);
router.get('/:id/messages', requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW), violationNoticeController.listMessages);
router.post(
  '/:id/messages',
  requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW),
  messageUpload.any(),
  violationNoticeController.sendMessage,
);
router.patch(
  '/:id/messages/:messageId',
  requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW),
  validateBody(editMessageSchema),
  violationNoticeController.editMessage,
);
router.delete(
  '/:id/messages/:messageId',
  requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW),
  violationNoticeController.deleteMessage,
);
router.post(
  '/:id/messages/:messageId/reactions',
  requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW),
  validateBody(reactionSchema),
  violationNoticeController.toggleReaction,
);
router.post('/:id/read', requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW), violationNoticeController.markRead);
router.post('/:id/leave', requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW), violationNoticeController.leave);
router.post('/:id/mute', requirePermission(PERMISSIONS.VIOLATION_NOTICE_VIEW), violationNoticeController.mute);

export default router;
