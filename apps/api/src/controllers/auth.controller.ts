import type { Request, Response, NextFunction } from 'express';
import { registerRequestSchema } from '@omnilert/shared';
import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';
import * as registrationService from '../services/registration.service.js';
import { AppError } from '../middleware/errorHandler.js';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, companySlug } = req.body;
    const result = await authService.loginTenantUser(email, password, companySlug);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listCompanies(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const result = await authService.listLoginCompanies(userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function switchCompany(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { companySlug } = req.body;
    const result = await authService.switchCompany(userId, companySlug);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshTokens(refreshToken);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response) {
  res.json({ success: true, data: req.user });
}

export async function registerRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = registerRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? 'Invalid registration request';
      throw new AppError(400, firstError);
    }
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const profilePictureFile = files?.profilePicture?.[0];
    const validIdFile = files?.validId?.[0];
    await registrationService.createRegistrationRequest({
      ...parsed.data,
      profilePictureFile: profilePictureFile
        ? {
          buffer: profilePictureFile.buffer,
          originalname: profilePictureFile.originalname,
          mimetype: profilePictureFile.mimetype,
        }
        : undefined,
      validIdFile: validIdFile
        ? {
          buffer: validIdFile.buffer,
          originalname: validIdFile.originalname,
          mimetype: validIdFile.mimetype,
        }
        : undefined,
    });
    res.status(201).json({ success: true, message: 'Request submitted successfully' });
  } catch (err) {
    next(err);
  }
}

export async function publicConfig(_req: Request, res: Response) {
  res.json({
    success: true,
    data: {
      discordInviteUrl: env.DISCORD_INVITE_URL,
    },
  });
}
