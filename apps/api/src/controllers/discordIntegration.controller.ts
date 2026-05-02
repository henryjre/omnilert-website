import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import {
  discordUserIntegrationService,
  DiscordIntegrationNotFoundError,
  DiscordIntegrationValidationError,
} from '../services/discordUserIntegration.service.js';
import { createDiscordSystemAdjustment } from '../services/discordSystemAdjustment.service.js';

function toAppError(error: unknown): AppError | null {
  if (error instanceof DiscordIntegrationValidationError) {
    return new AppError(400, error.message);
  }

  if (error instanceof DiscordIntegrationNotFoundError) {
    return new AppError(404, error.message);
  }

  return null;
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await discordUserIntegrationService.listUsers({
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
      include_inactive: req.query.include_inactive as string | undefined,
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    const mapped = toAppError(error);
    next(mapped ?? error);
  }
}

export async function lookupUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await discordUserIntegrationService.lookupUser({
      id: req.query.id as string | undefined,
      email: req.query.email as string | undefined,
      user_key: req.query.user_key as string | undefined,
      include_inactive: req.query.include_inactive as string | undefined,
    });

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    const mapped = toAppError(error);
    next(mapped ?? error);
  }
}

export async function getRegistrationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await discordUserIntegrationService.getRegistrationStatus({
      email: req.query.email as string | undefined,
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    const mapped = toAppError(error);
    next(mapped ?? error);
  }
}

export async function updateRegistrationDiscordId(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await discordUserIntegrationService.setRegistrationDiscordUserId({
      email: req.body.email,
      discord_id: req.body.discord_id,
    });

    res.json({
      success: true,
      data,
      message: 'Registration Discord user ID linked successfully',
    });
  } catch (error) {
    const mapped = toAppError(error);
    next(mapped ?? error);
  }
}

export async function updateUserDiscordId(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await discordUserIntegrationService.setDiscordUserId({
      email: req.body.email,
      discord_id: req.body.discord_id,
    });

    res.json({
      success: true,
      data: { user },
      message: 'Discord user ID linked successfully',
    });
  } catch (error: any) {
    if (error?.code === '23505') {
      next(new AppError(409, 'Discord ID is already linked to another user'));
      return;
    }

    const mapped = toAppError(error);
    next(mapped ?? error);
  }
}

export async function createSystemAdjustment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await createDiscordSystemAdjustment(req.body);

    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    const mapped = toAppError(error);
    next(mapped ?? error);
  }
}
