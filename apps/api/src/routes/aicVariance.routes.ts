import { Router } from 'express';
import multer from 'multer';
import { PERMISSIONS } from '@omnilert/shared';
import { authenticate } from '../middleware/auth.js';
import { resolveCompany } from '../middleware/companyResolver.js';
import { requireAnyPermission, requirePermission } from '../middleware/rbac.js';
import * as ctrl from '../controllers/aicVariance.controller.js';

const storage = multer.memoryStorage();
const MAX_FILE_SIZE = 50 * 1024 * 1024;

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

const router = Router();
router.use(authenticate, resolveCompany);

// ── Core ──────────────────────────────────────────────────────────────────────
router.get('/mentionables', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.mentionables);
router.get('/', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.list);
router.get('/:id', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.getById);
router.post('/:id/resolve', requirePermission(PERMISSIONS.AIC_VARIANCE_MANAGE), ctrl.resolve);
router.post(
  '/:id/request-vn',
  requireAnyPermission(PERMISSIONS.AIC_VARIANCE_MANAGE, PERMISSIONS.VIOLATION_NOTICE_MANAGE),
  ctrl.requestVN,
);
router.post('/:id/leave', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.leave);
router.post('/:id/mute', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.mute);
router.post('/:id/read', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.markRead);

// ── Messages ──────────────────────────────────────────────────────────────────
router.get('/:id/messages', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.listMessages);
router.post('/:id/messages', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), messageUpload.any(), ctrl.sendMessage);
router.patch('/:id/messages/:messageId', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.editMessage);
router.delete('/:id/messages/:messageId', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.deleteMessage);
router.post('/:id/messages/:messageId/reactions', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.toggleReaction);

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/:id/tasks', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.listTasks);
router.post('/:id/tasks', requirePermission(PERMISSIONS.AIC_VARIANCE_MANAGE), ctrl.createTask);
router.get('/:id/tasks/:taskId', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.getTask);
router.get('/:id/tasks/:taskId/messages', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.listTaskMessages);
router.post('/:id/tasks/:taskId/messages', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), messageUpload.any(), ctrl.sendTaskMessage);
router.post('/:id/tasks/:taskId/complete', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.completeTask);
router.post('/:id/tasks/:taskId/messages/:messageId/reactions', requirePermission(PERMISSIONS.AIC_VARIANCE_VIEW), ctrl.toggleTaskReaction);

export default router;
