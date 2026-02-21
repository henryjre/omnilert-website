import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@omnilert/shared';
import { verifyAccessToken } from '../utils/jwt.js';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

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
      if (!payload.permissions.includes('pos_verification.view')) {
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
      const canViewAll = socket.data.user?.permissions.includes('admin.view_all_branches');
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
      if (!payload.permissions.includes('pos_session.view')) {
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
      const canViewAll = socket.data.user?.permissions.includes('admin.view_all_branches');
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
      if (!payload.permissions.includes('shift.view_all') && !payload.permissions.includes('account.view_schedule')) {
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
      if (!payload.permissions.includes('employee_verification.view')) {
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

  // Employee Requirements namespace
  const employeeRequirementsNs = io.of('/employee-requirements');
  employeeRequirementsNs.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = verifyAccessToken(token);
      if (!payload.permissions.includes('shift.view_all')) {
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
      const canViewAll = socket.data.user?.permissions.includes('shift.view_all')
        || socket.data.user?.permissions.includes('admin.view_all_branches');
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
