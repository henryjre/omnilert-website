import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validateRequest.js';
import * as caseReportController from '../controllers/caseReport.controller.js';

const storage = multer.memoryStorage();
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const attachmentUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
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

const createCaseSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(2000),
});

const correctiveActionSchema = z.object({
  correctiveAction: z.string().trim().min(1),
});

const resolutionSchema = z.object({
  resolution: z.string().trim().min(1),
});

const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(20),
});

const editMessageSchema = z.object({
  content: z.string().trim().min(1),
});

const router = Router();

router.use(authenticate, resolveCompany);

router.get('/mentionables', requirePermission(PERMISSIONS.CASE_REPORT_VIEW), caseReportController.mentionables);
router.get('/', requirePermission(PERMISSIONS.CASE_REPORT_VIEW), caseReportController.list);
router.post('/', requirePermission(PERMISSIONS.CASE_REPORT_CREATE), validateBody(createCaseSchema), caseReportController.create);
router.get('/:id', requirePermission(PERMISSIONS.CASE_REPORT_VIEW), caseReportController.getById);
router.patch(
  '/:id/corrective-action',
  requirePermission(PERMISSIONS.CASE_REPORT_VIEW),
  validateBody(correctiveActionSchema),
  caseReportController.updateCorrectiveAction,
);
router.patch(
  '/:id/resolution',
  requirePermission(PERMISSIONS.CASE_REPORT_VIEW),
  validateBody(resolutionSchema),
  caseReportController.updateResolution,
);
router.post('/:id/close', requirePermission(PERMISSIONS.CASE_REPORT_CLOSE), caseReportController.close);
router.post('/:id/request-vn', requirePermission(PERMISSIONS.CASE_REPORT_MANAGE), caseReportController.requestViolationNotice);
router.post(
  '/:id/attachments',
  requirePermission(PERMISSIONS.CASE_REPORT_VIEW),
  attachmentUpload.any(),
  caseReportController.uploadAttachment,
);
router.delete('/:id/attachments/:attachmentId', requirePermission(PERMISSIONS.CASE_REPORT_VIEW), caseReportController.deleteAttachment);
router.get('/:id/messages', requirePermission(PERMISSIONS.CASE_REPORT_VIEW), caseReportController.listMessages);
router.post(
  '/:id/messages',
  requirePermission(PERMISSIONS.CASE_REPORT_VIEW),
  messageUpload.any(),
  caseReportController.sendMessage,
);
router.post(
  '/:id/messages/:messageId/reactions',
  requirePermission(PERMISSIONS.CASE_REPORT_VIEW),
  validateBody(reactionSchema),
  caseReportController.toggleReaction,
);
router.patch(
  '/:id/messages/:messageId',
  requirePermission(PERMISSIONS.CASE_REPORT_VIEW),
  validateBody(editMessageSchema),
  caseReportController.editMessage,
);
router.delete(
  '/:id/messages/:messageId',
  requirePermission(PERMISSIONS.CASE_REPORT_VIEW),
  caseReportController.deleteMessage,
);
router.post('/:id/leave', requirePermission(PERMISSIONS.CASE_REPORT_VIEW), caseReportController.leave);
router.post('/:id/mute', requirePermission(PERMISSIONS.CASE_REPORT_VIEW), caseReportController.mute);
router.post('/:id/read', requirePermission(PERMISSIONS.CASE_REPORT_VIEW), caseReportController.markRead);

export default router;
