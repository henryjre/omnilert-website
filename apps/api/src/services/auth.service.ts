import crypto from 'crypto';
import { db } from '../config/database.js';
import { comparePassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { AppError } from '../middleware/errorHandler.js';
import { SYSTEM_ROLES } from '@omnilert/shared';

interface TenantUserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  employee_number: number | null;
  avatar_url: string | null;
  is_active: boolean;
  updated?: boolean;
}

interface SuperAdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const [first, ...rest] = trimmed.split(/\s+/);
  return {
    firstName: first || 'Super',
    lastName: rest.length > 0 ? rest.join(' ') : 'Admin',
  };
}

async function loadUserRolesAndPermissions(tenantDb: any, userId: string) {
  const roles = await tenantDb('user_roles')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('user_roles.user_id', userId)
    .select('roles.id', 'roles.name', 'roles.color');

  const roleIds = roles.map((r: { id: string }) => r.id);
  let permissions: string[] = [];
  if (roleIds.length > 0) {
    const perms = await tenantDb('role_permissions')
      .join('permissions', 'role_permissions.permission_id', 'permissions.id')
      .whereIn('role_permissions.role_id', roleIds)
      .select('permissions.key')
      .distinct();
    permissions = perms.map((p: { key: string }) => p.key);
  }

  return { roles, permissions };
}

async function loadUserBranchIds(tenantDb: any, userId: string): Promise<string[]> {
  const branches = await tenantDb('user_branches')
    .where('user_id', userId)
    .select('branch_id');
  return branches.map((b: { branch_id: string }) => b.branch_id);
}

async function ensureSuperAdminMirrorUser(
  tenantDb: any,
  superAdmin: SuperAdminRow,
): Promise<TenantUserRow> {
  const normalizedEmail = normalizeEmail(superAdmin.email);
  const { firstName, lastName } = splitName(superAdmin.name);

  const existing = await tenantDb('users').where({ email: normalizedEmail }).first();
  let user: TenantUserRow;

  if (existing) {
    const [updated] = await tenantDb('users')
      .where({ id: existing.id })
      .update({
        email: normalizedEmail,
        first_name: firstName,
        last_name: lastName,
        password_hash: superAdmin.password_hash,
        is_active: true,
        updated_at: new Date(),
      })
      .returning('*');
    user = updated as TenantUserRow;
    logger.info({ userId: user.id, email: normalizedEmail }, 'Super admin mirror user synchronized');
  } else {
    const [created] = await tenantDb('users')
      .insert({
        email: normalizedEmail,
        password_hash: superAdmin.password_hash,
        first_name: firstName,
        last_name: lastName,
        is_active: true,
      })
      .returning('*');
    user = created as TenantUserRow;
    logger.info({ userId: user.id, email: normalizedEmail }, 'Super admin mirror user created');
  }

  const adminRole = await tenantDb('roles')
    .where({ name: SYSTEM_ROLES.ADMINISTRATOR })
    .first();
  if (!adminRole) {
    throw new AppError(500, 'Administrator role not found in tenant');
  }

  const hasRole = await tenantDb('user_roles')
    .where({ user_id: user.id, role_id: adminRole.id })
    .first();
  if (!hasRole) {
    await tenantDb('user_roles').insert({
      user_id: user.id,
      role_id: adminRole.id,
    });
    logger.info({ userId: user.id, roleId: adminRole.id }, 'Administrator role granted to super mirror');
  }

  return user;
}

export async function loginTenantUser(email: string, password: string, companySlug: string) {
  const masterDb = db.getMasterDb();
  const normalizedEmail = normalizeEmail(email);

  // Find company
  const company = await masterDb('companies').where({ slug: companySlug, is_active: true }).first();
  if (!company) {
    throw new AppError(404, 'Company not found');
  }

  // Connect to tenant DB
  const tenantDb = await db.getTenantDb(company.db_name);

  // Find user
  let user = await tenantDb('users').where({ email: normalizedEmail, is_active: true }).first() as TenantUserRow | undefined;
  let isSuperAdminFallback = false;

  if (!user || !(await comparePassword(password, user.password_hash))) {
    const superAdmin = await masterDb('super_admins')
      .where({ email: normalizedEmail })
      .select('id', 'email', 'name', 'password_hash')
      .first() as SuperAdminRow | undefined;

    if (!superAdmin || !(await comparePassword(password, superAdmin.password_hash))) {
      throw new AppError(401, 'Invalid email or password');
    }

    user = await ensureSuperAdminMirrorUser(tenantDb, superAdmin);
    isSuperAdminFallback = true;
    logger.info(
      { superAdminId: superAdmin.id, companySlug, tenantUserId: user.id },
      'Super admin fallback login used',
    );
  }

  // Load roles and permissions
  const { roles, permissions } = await loadUserRolesAndPermissions(tenantDb, user.id);

  // Load branch assignments
  const branchIds = await loadUserBranchIds(tenantDb, user.id);

  // Generate tokens
  const accessToken = signAccessToken({
    sub: user.id,
    companyId: company.id,
    companySlug: company.slug,
    companyDbName: company.db_name,
    roles: roles.map((r: { name: string }) => r.name),
    permissions,
    branchIds,
  });

  const refreshToken = signRefreshToken(user.id, company.db_name);

  // Store refresh token hash
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await tenantDb('refresh_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  // Update last login
  await tenantDb('users').where({ id: user.id }).update({ last_login_at: new Date() });

  // Create notification if user hasn't updated their profile
  if (!isSuperAdminFallback && user.updated !== true) {
    await tenantDb('employee_notifications').insert({
      user_id: user.id,
      title: 'Complete Your Profile',
      message: 'Please update your account profile settings with your personal information.',
      type: 'warning',
      link_url: '/account/profile',
    });
  }

  // Always notify employees about employment requirement submission progress on login.
  if (!isSuperAdminFallback) {
    try {
      const hasRequirementTypesTable = await tenantDb.schema.hasTable('employment_requirement_types');
      const hasRequirementSubmissionsTable = await tenantDb.schema.hasTable('employment_requirement_submissions');

      if (hasRequirementTypesTable && hasRequirementSubmissionsTable) {
        const totalResult = await tenantDb('employment_requirement_types')
          .where({ is_active: true })
          .count<{ count: string }>('code as count')
          .first();
        const totalRequirements = Number(totalResult?.count ?? 0);

        if (totalRequirements > 0) {
          const submittedRows = await tenantDb('employment_requirement_submissions')
            .where({ user_id: user.id })
            .distinct('requirement_code');
          const submittedCount = submittedRows.length;

          if (submittedCount === 0) {
            await tenantDb('employee_notifications').insert({
              user_id: user.id,
              title: 'Submit Your Requirements',
              message: 'Please submit your employment requirements in My Account > Profile.',
              type: 'warning',
              link_url: '/account/profile',
            });
          } else if (submittedCount < totalRequirements) {
            const remaining = totalRequirements - submittedCount;
            await tenantDb('employee_notifications').insert({
              user_id: user.id,
              title: 'Complete Your Requirements',
              message: `You have submitted ${submittedCount} of ${totalRequirements} employment requirements. Please submit the remaining ${remaining}.`,
              type: 'warning',
              link_url: '/account/profile',
            });
          }
        }
      }
    } catch (error) {
      logger.warn(
        { err: error, userId: user.id, companySlug },
        'Failed to evaluate employment requirement progress notification on login',
      );
    }
  }

  return {
    accessToken,
    refreshToken,
    companyThemeColor: company.theme_color ?? '#2563EB',
    companyName: company.name,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      avatarUrl: user.avatar_url || null,
      employeeNumber: user.employee_number ?? null,
      roles,
      permissions,
      branchIds,
    },
  };
}

export async function refreshTokens(refreshTokenStr: string) {
  const payload = verifyRefreshToken(refreshTokenStr);
  const masterDb = db.getMasterDb();
  const company = await masterDb('companies')
    .where({ db_name: payload.companyDbName, is_active: true })
    .first();
  if (!company) {
    throw new AppError(401, 'Company is no longer available');
  }

  let tenantDb;
  try {
    tenantDb = await db.getTenantDb(payload.companyDbName);
  } catch {
    throw new AppError(401, 'Company is no longer available');
  }

  // Verify stored token
  const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');
  const storedToken = await tenantDb('refresh_tokens')
    .where({ token_hash: tokenHash, is_revoked: false })
    .where('expires_at', '>', new Date())
    .first();

  if (!storedToken) {
    throw new AppError(401, 'Invalid refresh token');
  }

  // Revoke old token
  await tenantDb('refresh_tokens').where({ id: storedToken.id }).update({ is_revoked: true });

  // Load user data
  const user = await tenantDb('users').where({ id: payload.sub, is_active: true }).first();
  if (!user) {
    throw new AppError(401, 'User not found');
  }

  // Reload roles and permissions
  const roles = await tenantDb('user_roles')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('user_roles.user_id', user.id)
    .select('roles.id', 'roles.name', 'roles.color');

  const roleIds = roles.map((r: { id: string }) => r.id);
  let permissions: string[] = [];
  if (roleIds.length > 0) {
    const perms = await tenantDb('role_permissions')
      .join('permissions', 'role_permissions.permission_id', 'permissions.id')
      .whereIn('role_permissions.role_id', roleIds)
      .select('permissions.key')
      .distinct();
    permissions = perms.map((p: { key: string }) => p.key);
  }

  const branches = await tenantDb('user_branches')
    .where('user_id', user.id)
    .select('branch_id');
  const branchIds = branches.map((b: { branch_id: string }) => b.branch_id);

  // Generate new tokens
  const newAccessToken = signAccessToken({
    sub: user.id,
    companyId: company.id,
    companySlug: company.slug,
    companyDbName: company.db_name,
    roles: roles.map((r: { name: string }) => r.name),
    permissions,
    branchIds,
  });

  const newRefreshToken = signRefreshToken(user.id, payload.companyDbName);
  const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  await tenantDb('refresh_tokens').insert({
    user_id: user.id,
    token_hash: newTokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshTokenStr: string) {
  try {
    const payload = verifyRefreshToken(refreshTokenStr);
    const tenantDb = await db.getTenantDb(payload.companyDbName);
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');
    await tenantDb('refresh_tokens').where({ token_hash: tokenHash }).update({ is_revoked: true });
  } catch {
    // Token already invalid, that's fine
  }
}
