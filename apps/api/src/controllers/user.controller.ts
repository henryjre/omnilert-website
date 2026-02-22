import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { comparePassword, hashPassword } from '../utils/password.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { syncUserProfileToOdoo, getCompanyPin, syncAvatarToOdoo } from '../services/odoo.service.js';
import { buildTenantStoragePrefix, uploadFile, deleteFolder } from '../services/storage.service.js';
import { verifyRefreshToken } from '../utils/jwt.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const users = await tenantDb('users')
      .select('id', 'email', 'first_name', 'last_name', 'user_key', 'employee_number', 'avatar_url', 'is_active', 'last_login_at', 'created_at')
      .orderBy('created_at', 'desc');

    // Attach roles and branches to each user
    const usersWithDetails = await Promise.all(
      users.map(async (user: { id: string }) => {
        const roles = await tenantDb('user_roles')
          .join('roles', 'user_roles.role_id', 'roles.id')
          .where('user_roles.user_id', user.id)
          .select('roles.id', 'roles.name', 'roles.color');
        const branches = await tenantDb('user_branches')
          .join('branches', 'user_branches.branch_id', 'branches.id')
          .where('user_branches.user_id', user.id)
          .select('branches.id', 'branches.name');
        return { ...user, roles, branches };
      }),
    );

    res.json({ success: true, data: usersWithDetails });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { email, password, firstName, lastName, userKey, employeeNumber, roleIds, branchIds } = req.body;

    const passwordHash = await hashPassword(password);

    const [user] = await tenantDb('users')
      .insert({
        email,
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        user_key: userKey,
        employee_number: employeeNumber ?? null,
      })
      .returning('*');

    // Assign roles
    if (roleIds && roleIds.length > 0) {
      const roleRows = roleIds.map((roleId: string) => ({
        user_id: user.id,
        role_id: roleId,
        assigned_by: req.user!.sub,
      }));
      await tenantDb('user_roles').insert(roleRows);
    }

    // Assign branches
    if (branchIds && branchIds.length > 0) {
      const branchRows = branchIds.map((branchId: string, i: number) => ({
        user_id: user.id,
        branch_id: branchId,
        is_primary: i === 0,
      }));
      await tenantDb('user_branches').insert(branchRows);
    }

    res.status(201).json({ success: true, data: user });
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
    const tenantDb = req.tenantDb!;
    const { id } = req.params;

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (req.body.email !== undefined) updates.email = req.body.email;
    if (req.body.firstName !== undefined) updates.first_name = req.body.firstName;
    if (req.body.lastName !== undefined) updates.last_name = req.body.lastName;
    if (req.body.userKey !== undefined) updates.user_key = req.body.userKey;
    if (req.body.employeeNumber !== undefined) updates.employee_number = req.body.employeeNumber;
    if (req.body.isActive !== undefined) updates.is_active = req.body.isActive;

    const [user] = await tenantDb('users').where({ id }).update(updates).returning('*');
    if (!user) throw new AppError(404, 'User not found');

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
    const tenantDb = req.tenantDb!;
    const { id } = req.params;

    const [user] = await tenantDb('users')
      .where({ id })
      .update({ is_active: false, updated_at: new Date() })
      .returning('*');

    if (!user) throw new AppError(404, 'User not found');
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    next(err);
  }
}

export async function destroy(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;

    const count = await tenantDb('users').where({ id }).delete();
    if (!count) throw new AppError(404, 'User not found');

    res.json({ success: true, message: 'User permanently deleted' });
  } catch (err) {
    next(err);
  }
}

export async function assignRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const { roleIds } = req.body;

    await tenantDb('user_roles').where('user_id', id).delete();

    if (roleIds && roleIds.length > 0) {
      const rows = roleIds.map((roleId: string) => ({
        user_id: id,
        role_id: roleId,
        assigned_by: req.user!.sub,
      }));
      await tenantDb('user_roles').insert(rows);
    }

    res.json({ success: true, message: 'Roles updated' });
  } catch (err) {
    next(err);
  }
}

export async function assignBranches(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const { branchIds } = req.body;

    await tenantDb('user_branches').where('user_id', id).delete();

    if (branchIds && branchIds.length > 0) {
      const rows = branchIds.map((branchId: string, i: number) => ({
        user_id: id,
        branch_id: branchId,
        is_primary: i === 0,
      }));
      await tenantDb('user_branches').insert(rows);
    }

    res.json({ success: true, message: 'Branches updated' });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    const user = await tenantDb('users')
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
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    const user = await tenantDb('users')
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
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const { currentPassword, newPassword, currentRefreshToken } = req.body;

    if (currentPassword === newPassword) {
      throw new AppError(400, 'New password must be different from current password');
    }

    const user = await tenantDb('users')
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

    await tenantDb.transaction(async (trx) => {
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
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const { companyId } = req.body;

    // Get user to check if already has pin
    const existingUser = await tenantDb('users')
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
    await tenantDb('users')
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
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const companyStorageRoot = req.companyContext?.companyStorageRoot ?? '';
    const file = req.file as Express.Multer.File | undefined;

    if (!file) {
      throw new AppError(400, 'No file uploaded');
    }

    // Get current user to check for existing avatar
    const currentUser = await tenantDb('users')
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
    await tenantDb('users')
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
