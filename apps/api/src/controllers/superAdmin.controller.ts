import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import * as superAdminService from '../services/superAdmin.service.js';
import { issueSuperAdminAccessToken } from '../services/superAdminAuth.service.js';

function matchesBootstrapSecret(value?: string): boolean {
  if (!value) return false;
  const provided = Buffer.from(value);
  const expected = Buffer.from(env.SUPER_ADMIN_BOOTSTRAP_SECRET);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function bootstrap(req: Request, res: Response, next: NextFunction) {
  try {
    const providedSecret = req.header('x-super-admin-bootstrap-secret');
    if (!matchesBootstrapSecret(providedSecret)) {
      logger.warn({ ip: req.ip }, 'Super admin bootstrap rejected');
      throw new AppError(401, 'Unauthorized');
    }

    const superAdmin = await superAdminService.createFirstSuperAdmin(req.body);
    logger.info({ superAdminEmail: superAdmin.email, ip: req.ip }, 'Super admin bootstrapped');
    res.status(201).json({ success: true, data: superAdmin });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const superAdmin = await superAdminService.loginSuperAdmin(email, password);
    const accessToken = issueSuperAdminAccessToken({
      id: superAdmin.id,
      email: superAdmin.email,
      name: superAdmin.name,
    });
    logger.info({ superAdminEmail: superAdmin.email, ip: req.ip }, 'Super admin login success');
    res.json({ success: true, data: { accessToken, superAdmin } });
  } catch (err) {
    logger.warn({ superAdminEmail: req.body?.email, ip: req.ip }, 'Super admin login failed');
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const superAdminId = req.superAdmin?.sub;
    if (!superAdminId) {
      throw new AppError(401, 'Unauthorized');
    }
    const superAdmin = await superAdminService.getSuperAdminById(superAdminId);
    res.json({ success: true, data: superAdmin });
  } catch (err) {
    next(err);
  }
}
