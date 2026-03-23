import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { verifyAccessToken } from '../utils/jwt.js';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import { GLOBAL_STORE_AUDITS_ROOM } from '../services/storeAuditRealtime.service.js';

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents> | null = null;

export function initializeSocket(
  server: HttpServer,
): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
    path: '/socket.io',
  });

  // Global auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // POS Verification namespace
  const posVerificationNs = io.of('/pos-verification');
  posVerificationNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      if (!payload.permissions.includes(PERMISSIONS.POS_VERIFICATION_VIEW)) {
        return next(new Error('Insufficient permissions'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  posVerificationNs.on('connection', (socket) => {
    logger.debug(`POS Verification: ${socket.data.user?.sub} connected`);

    socket.on('join-branch', (branchId: string) => {
      const canViewAll = socket.data.user?.permissions.includes(PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES);
      if (canViewAll || socket.data.user?.branchIds.includes(branchId)) {
        socket.join(`branch:${branchId}`);
        logger.debug(`POS Verification: ${socket.data.user?.sub} joined branch:${branchId}`);
      }
    });

    socket.on('leave-branch', (branchId: string) => {
      socket.leave(`branch:${branchId}`);
    });
  });

  // POS Session namespace
  const posSessionNs = io.of('/pos-session');
  posSessionNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      if (!payload.permissions.includes(PERMISSIONS.POS_SESSION_VIEW)) {
        return next(new Error('Insufficient permissions'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  posSessionNs.on('connection', (socket) => {
    logger.debug(`POS Session: ${socket.data.user?.sub} connected`);

    socket.on('join-branch', (branchId: string) => {
      const canViewAll = socket.data.user?.permissions.includes(PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES);
      if (canViewAll || socket.data.user?.branchIds.includes(branchId)) {
        socket.join(`branch:${branchId}`);
        logger.debug(`POS Session: ${socket.data.user?.sub} joined branch:${branchId}`);
      }
    });

    socket.on('leave-branch', (branchId: string) => {
      socket.leave(`branch:${branchId}`);
    });
  });

  // Employee Shifts namespace
  const employeeShiftsNs = io.of('/employee-shifts');
  employeeShiftsNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      if (
        !payload.permissions.includes(PERMISSIONS.SHIFT_VIEW_ALL)
        && !payload.permissions.includes(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE)
      ) {
        return next(new Error('Insufficient permissions'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // Employee Verifications namespace
  const employeeVerificationsNs = io.of('/employee-verifications');
  employeeVerificationsNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      if (!payload.permissions.includes(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW)) {
        return next(new Error('Insufficient permissions'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  employeeVerificationsNs.on('connection', (socket) => {
    const companyId = socket.data.user?.companyId;
    if (companyId) {
      socket.join(`company:${companyId}`);
    }
    logger.debug(`Employee Verifications: ${socket.data.user?.sub} connected`);
  });

  // Store Audits namespace
  const storeAuditsNs = io.of('/store-audits');
  storeAuditsNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      if (!payload.permissions.includes(PERMISSIONS.STORE_AUDIT_VIEW)) {
        return next(new Error('Insufficient permissions'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  storeAuditsNs.on('connection', (socket) => {
    const companyId = socket.data.user?.companyId;
    if (companyId) {
      socket.join(`company:${companyId}`);
    }
    socket.join(GLOBAL_STORE_AUDITS_ROOM);
    logger.debug(`Store Audits: ${socket.data.user?.sub} connected`);
  });

  // Case Reports namespace
  const caseReportsNs = io.of('/case-reports');
  caseReportsNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      if (!payload.permissions.includes(PERMISSIONS.CASE_REPORT_VIEW)) {
        return next(new Error('Insufficient permissions'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  caseReportsNs.on('connection', (socket) => {
    const companyId = socket.data.user?.companyId;
    if (companyId) {
      socket.join(`company:${companyId}`);
    }
    logger.debug(`Case Reports: ${socket.data.user?.sub} connected`);
  });

  // Violation Notices namespace
  const violationNoticesNs = io.of('/violation-notices');
  violationNoticesNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      if (!payload.permissions.includes(PERMISSIONS.VIOLATION_NOTICE_VIEW)) {
        return next(new Error('Insufficient permissions'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  violationNoticesNs.on('connection', (socket) => {
    const companyId = socket.data.user?.companyId;
    if (companyId) {
      socket.join(`company:${companyId}`);
    }
    logger.debug(`Violation Notices: ${socket.data.user?.sub} connected`);
  });

  // Employee Requirements namespace
  const employeeRequirementsNs = io.of('/employee-requirements');
  employeeRequirementsNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      const canAccessEmployeeRequirements = payload.permissions.includes(PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE)
        || payload.permissions.includes(PERMISSIONS.SHIFT_VIEW_ALL);
      if (!canAccessEmployeeRequirements) {
        return next(new Error('Insufficient permissions'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  employeeRequirementsNs.on('connection', (socket) => {
    const companyId = socket.data.user?.companyId;
    if (companyId) {
      socket.join(`company:${companyId}`);
    }
    logger.debug(`Employee Requirements: ${socket.data.user?.sub} connected`);
  });

  employeeShiftsNs.on('connection', (socket) => {
    logger.debug(`Employee Shifts: ${socket.data.user?.sub} connected`);

    socket.on('join-branch', (branchId: string) => {
      const canViewAll = socket.data.user?.permissions.includes(PERMISSIONS.SHIFT_VIEW_ALL)
        || socket.data.user?.permissions.includes(PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES);
      if (canViewAll || socket.data.user?.branchIds.includes(branchId)) {
        socket.join(`branch:${branchId}`);
        logger.debug(`Employee Shifts: ${socket.data.user?.sub} joined branch:${branchId}`);
      } else {
        logger.debug(`Employee Shifts: ${socket.data.user?.sub} DENIED join branch:${branchId}`);
      }
    });

    socket.on('leave-branch', (branchId: string) => {
      socket.leave(`branch:${branchId}`);
    });
  });

  // Peer Evaluations namespace
  const peerEvaluationsNs = io.of('/peer-evaluations');
  peerEvaluationsNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      const canAccessPeerEvaluations = payload.permissions.includes(PERMISSIONS.PEER_EVALUATION_VIEW)
        || payload.permissions.includes(PERMISSIONS.PEER_EVALUATION_MANAGE);
      if (!canAccessPeerEvaluations) {
        return next(new Error('Insufficient permissions'));
      }
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  peerEvaluationsNs.on('connection', (socket) => {
    const companyId = socket.data.user?.companyId;
    if (companyId) {
      socket.join(`company:${companyId}`);
    }
    logger.debug(`Peer Evaluations: ${socket.data.user?.sub} connected`);
  });

  // Notification namespace
  const notificationNs = io.of('/notifications');
  notificationNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  notificationNs.on('connection', (socket) => {
    const userId = socket.data.user?.sub;
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });

  logger.info('Socket.IO initialized');
  return io;
}

export function getIO(): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}

export function hasActiveNotificationSocket(userId: string): boolean {
  if (!io) return false;
  const room = io.of('/notifications').adapter.rooms.get(`user:${userId}`);
  return Boolean(room && room.size > 0);
}
