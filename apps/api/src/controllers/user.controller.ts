import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { comparePassword, hashPassword } from '../utils/password.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { getCompanyPin, syncAvatarToOdoo } from '../services/odoo.service.js';
import { buildTenantStoragePrefix, uploadFile, deleteFolder } from '../services/storage.service.js';
import { verifyRefreshToken } from '../utils/jwt.js';
import * as globalUserManagementService from '../services/globalUserManagement.service.js';
import { db } from '../config/database.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const users = await globalUserManagementService.listGlobalUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

export async function assignmentOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await globalUserManagementService.getGlobalUserAssignmentOptions();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await globalUserManagementService.createGlobalUser({
      email: req.body.email,
      password: req.body.password,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      userKey: req.body.userKey,
      employeeNumber: req.body.employeeNumber,
      roleIds: req.body.roleIds,
      companyAssignments: req.body.companyAssignments,
    });

    res.status(201).json({
      success: true,
      data: result.user,
      message: result.provisioning.failures.length > 0
        ? `User created with ${result.provisioning.failures.length} provisioning issue(s)`
        : 'User created successfully',
      provisioning: result.provisioning,
    });
  } catch (err: any) {
    if (err?.code === '23505' && String(err?.detail ?? '').includes('user_key')) {
      next(new AppError(409, 'User key already exists'));
      return;
    }
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const user = await globalUserManagementService.updateGlobalUser({
      userId: id as string,
      email: req.body.email,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      userKey: req.body.userKey,
      employeeNumber: req.body.employeeNumber,
      isActive: req.body.isActive,
    });

    res.json({ success: true, data: user });
  } catch (err: any) {
    if (err?.code === '23505' && String(err?.detail ?? '').includes('user_key')) {
      next(new AppError(409, 'User key already exists'));
      return;
    }
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await globalUserManagementService.deactivateGlobalUser(id as string);
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    next(err);
  }
}

export async function destroy(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await globalUserManagementService.deleteGlobalUser(id as string);
    res.json({ success: true, message: 'User permanently deleted' });
  } catch (err) {
    next(err);
  }
}

export async function assignRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { roleIds } = req.body;
    await globalUserManagementService.assignGlobalRoles({
      userId: id as string,
      roleIds: roleIds ?? [],
    });

    res.json({ success: true, message: 'Roles updated' });
  } catch (err) {
    next(err);
  }
}

export async function assignBranches(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await globalUserManagementService.assignGlobalCompanyBranches({
      userId: id as string,
      companyAssignments: req.body.companyAssignments ?? [],
    });

    res.json({
      success: true,
      message: result.failures.length > 0
        ? `Assignments updated with ${result.failures.length} provisioning issue(s)`
        : 'Assignments updated',
      provisioning: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const masterDb = db.getMasterDb();
    const userId = req.user!.sub;

    const user = await masterDb('users')
      .where({ id: userId })
      .select(
        'id',
        'email',
        'first_name',
        'last_name',
        'user_key',
        'mobile_number',
        'legal_name',
        'birthday',
        'gender',
        'avatar_url',
        'pin',
        'valid_id_url',
        'emergency_contact',
        'emergency_phone',
        'bank_id',
        'bank_account_number',
      )
      .first();

    if (!user) throw new AppError(404, 'User not found');

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    throw new AppError(
      400,
      'Direct profile updates are disabled. Submit personal information verification via /account/personal-information/verifications.',
    );
  } catch (err) {
    next(err);
  }
}

export async function getPin(req: Request, res: Response, next: NextFunction) {
  try {
    const masterDb = db.getMasterDb();
    const userId = req.user!.sub;

    const user = await masterDb('users')
      .where({ id: userId })
      .select('id', 'pin')
      .first();

    if (!user) throw new AppError(404, 'User not found');

    res.json({ success: true, data: { pin: user.pin } });
  } catch (err) {
    next(err);
  }
}

export async function changeMyPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const masterDb = db.getMasterDb();
    const userId = req.user!.sub;
    const { currentPassword, newPassword, currentRefreshToken } = req.body;

    if (currentPassword === newPassword) {
      throw new AppError(400, 'New password must be different from current password');
    }

    const user = await masterDb('users')
      .where({ id: userId })
      .select('id', 'password_hash')
      .first();

    if (!user) throw new AppError(404, 'User not found');

    const isCurrentValid = await comparePassword(currentPassword, user.password_hash);
    if (!isCurrentValid) {
      throw new AppError(400, 'Current password is incorrect');
    }

    const passwordHash = await hashPassword(newPassword);
    // Ensure provided refresh token belongs to this user/session context
    const refreshPayload = verifyRefreshToken(currentRefreshToken);
    if (refreshPayload.sub !== userId || refreshPayload.companyDbName !== req.user!.companyDbName) {
      throw new AppError(401, 'Invalid current session token');
    }

    const currentTokenHash = crypto.createHash('sha256').update(currentRefreshToken).digest('hex');

    await masterDb.transaction(async (trx) => {
      await trx('users')
        .where({ id: userId })
        .update({ password_hash: passwordHash, updated_at: new Date() });

      // Revoke every other session token; keep current session active.
      await trx('refresh_tokens')
        .where({ user_id: userId, is_revoked: false })
        .whereNot({ token_hash: currentTokenHash })
        .update({ is_revoked: true });
    });

    res.json({ success: true, message: 'Password updated. Other sessions were logged out.' });
  } catch (err) {
    next(err);
  }
}

export async function setPin(req: Request, res: Response, next: NextFunction) {
  try {
    const masterDb = db.getMasterDb();
    const userId = req.user!.sub;
    const { companyId } = req.body;

    // Get user to check if already has pin
    const existingUser = await masterDb('users')
      .where({ id: userId })
      .select('id', 'pin', 'user_key')
      .first();

    if (!existingUser) throw new AppError(404, 'User not found');

    // If user already has pin, don't fetch again
    if (existingUser.pin) {
      res.json({ success: true, data: { pin: existingUser.pin } });
      return;
    }
    if (!existingUser.user_key) {
      throw new AppError(400, 'User key is required before fetching PIN');
    }

    // Default company ID if not provided (use 1 as default)
    const odooCompanyId = companyId || 1;

    // Fetch pin from Odoo
    const pin = await getCompanyPin(existingUser.user_key, odooCompanyId);

    if (!pin) {
      throw new AppError(404, 'No PIN code found for this company');
    }

    // Save pin to user
    await masterDb('users')
      .where({ id: userId })
      .update({ pin, updated_at: new Date() });

    res.json({ success: true, data: { pin } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /users/me/avatar
 * Upload or update user avatar
 */
export async function uploadAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    const masterDb = db.getMasterDb();
    const userId = req.user!.sub;
    const companyStorageRoot = req.companyContext?.companyStorageRoot ?? '';
    const file = req.file as Express.Multer.File | undefined;

    if (!file) {
      throw new AppError(400, 'No file uploaded');
    }

    // Get current user to check for existing avatar
    const currentUser = await masterDb('users')
      .where({ id: userId })
      .first('avatar_url', 'user_key', 'email');
    const currentAvatarUrl = currentUser?.avatar_url;

    // Delete old avatar folder if exists
    const folderPath = buildTenantStoragePrefix(companyStorageRoot, 'Profile Pictures', userId);
    if (currentAvatarUrl) {
      await deleteFolder(folderPath);
    }

    // Upload new avatar to S3
    const avatarUrl = await uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      folderPath
    );

    if (!avatarUrl) {
      throw new AppError(500, 'Failed to upload avatar');
    }

    // Update user record with new avatar URL
    await masterDb('users')
      .where({ id: userId })
      .update({ avatar_url: avatarUrl, updated_at: new Date() });

    // Sync avatar to Odoo without blocking user response.
    syncAvatarToOdoo({
      websiteUserKey: currentUser?.user_key ?? null,
      email: currentUser?.email ?? null,
      avatarUrl,
    }).catch((err) => {
      logger.error(`Failed to sync avatar to Odoo: ${err}`);
    });

    res.json({ success: true, data: { avatar_url: avatarUrl } });
  } catch (err) {
    next(err);
  }
}
