import crypto from 'crypto';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { AppError } from '../middleware/errorHandler.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES } from '@omnilert/shared';
import { createAndDispatchNotification } from './notification.service.js';
import {
  getGlobalUserByEmail,
  loadGlobalUserRolesAndPermissions,
  normalizeEmail,
} from './globalUser.service.js';
import { sendForgotPasswordEmail } from './mail.service.js';

const PASSWORD_RESET_EXPIRES_MINUTES = 10;
const PASSWORD_RESET_COOLDOWN_MINUTES = 30;

interface SuperAdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  theme_color: string | null;
}

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildPasswordResetUrl(token: string): string {
  const baseUrl = env.CLIENT_URL.replace(/\/+$/, '');
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

let systemRoleDefaultsEnsured = false;

async function ensureAdministratorRoleAssignment(userId: string): Promise<void> {
  const adminRole = await db.getDb()('roles')
    .where({ name: SYSTEM_ROLES.ADMINISTRATOR })
    .first('id');
  if (!adminRole) return;

  const existingRole = await db.getDb()('user_roles')
    .where({ user_id: userId, role_id: adminRole.id })
    .first('id');
  if (!existingRole) {
    await db.getDb()('user_roles').insert({
      user_id: userId,
      role_id: adminRole.id,
      assigned_by: null,
    });
  }
}

async function loadAllPermissionKeys(): Promise<string[]> {
  const rows = await db.getDb()('permissions').select('key');
  return rows.map((row: any) => String(row.key));
}

async function ensureSystemRolePermissionDefaults(): Promise<void> {
  if (systemRoleDefaultsEnsured) return;

  const roleRows = await db.getDb()('roles')
    .whereIn('name', Object.keys(DEFAULT_ROLE_PERMISSIONS))
    .select('id', 'name');
  if (roleRows.length === 0) {
    systemRoleDefaultsEnsured = true;
    return;
  }

  const permissionRows = await db.getDb()('permissions')
    .whereIn('key', Array.from(new Set(Object.values(DEFAULT_ROLE_PERMISSIONS).flat())))
    .select('id', 'key');

  const roleIdByName = new Map(roleRows.map((row: any) => [String(row.name), String(row.id)]));
  const permissionIdByKey = new Map(permissionRows.map((row: any) => [String(row.key), String(row.id)]));

  const inserts: Array<{ role_id: string; permission_id: string }> = [];
  for (const [roleName, permissionKeys] of Object.entries(DEFAULT_ROLE_PERMISSIONS) as Array<[string, string[]]>) {
    const roleId = roleIdByName.get(roleName);
    if (!roleId) continue;
    for (const key of permissionKeys) {
      const permissionId = permissionIdByKey.get(String(key));
      if (!permissionId) continue;
      inserts.push({ role_id: String(roleId), permission_id: String(permissionId) });
    }
  }

  if (inserts.length > 0) {
    await db.getDb()('role_permissions')
      .insert(inserts)
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }

  systemRoleDefaultsEnsured = true;
}

async function loadUserAssignedBranchIds(userId: string, isSuperAdmin: boolean): Promise<string[]> {
  if (isSuperAdmin) {
    const rows = await db.getDb()('branches as b')
      .join('companies as c', 'b.company_id', 'c.id')
      .where('b.is_active', true)
      .where('c.is_active', true)
      .where('c.is_root', false)
      .select('b.id');
    return rows.map((row: any) => String(row.id));
  }

  const rows = await db.getDb()('user_company_branches as ucb')
    .join('branches as b', 'ucb.branch_id', 'b.id')
    .where('ucb.user_id', userId)
    .where('b.is_active', true)
    .select('b.id');
  return rows.map((row: any) => String(row.id));
}

async function listAccessibleCompanies(input: {
  userId: string;
  isSuperAdmin: boolean;
}): Promise<CompanyRow[]> {
  if (input.isSuperAdmin) {
    const rows = await db.getDb()('companies')
      .where({ is_active: true })
      .select('id', 'name', 'slug', 'theme_color')
      .orderBy('name', 'asc')
      .orderBy('created_at', 'asc');
    return rows as CompanyRow[];
  }

  const rows = await db.getDb()('user_company_access as uca')
    .join('companies as companies', 'uca.company_id', 'companies.id')
    .where('uca.user_id', input.userId)
    .andWhere('uca.is_active', true)
    .andWhere('companies.is_active', true)
    .select(
      'companies.id',
      'companies.name',
      'companies.slug',
      'companies.theme_color',
    )
    .orderBy('companies.name', 'asc')
    .orderBy('companies.created_at', 'asc');

  return rows as CompanyRow[];
}

async function resolveCompanyForLogin(): Promise<CompanyRow> {
  const root = await db.getDb()('companies')
    .where({ is_root: true, is_active: true })
    .first('id', 'name', 'slug', 'theme_color');

  if (!root) {
    throw new AppError(500, 'Omnilert root company is not configured');
  }

  return root as CompanyRow;
}

// TODO: nudge queries using company_id currently reference the Omnilert root company and will
// return no results. These should be refactored to use the user's primary assigned company.
async function runLoginNudges(input: {
  companyId: string;
  companySlug: string;
  resolvedUser: any;
  sessionPermissions: string[];
  isSuperAdminFallback: boolean;
}): Promise<void> {
  const clearProfileCompletionReminder = async () => {
    await db.getDb()('employee_notifications')
      .where({
        user_id: input.resolvedUser.id,
        title: 'Complete Your Profile',
        link_url: '/account/profile',
        is_read: false,
      })
      .update({ is_read: true });
  };

  let latestPersonalVerificationStatus: string | null = null;
  try {
    const latestPersonalVerification = await db.getDb()('personal_information_verifications')
      .where({ user_id: input.resolvedUser.id, company_id: input.companyId })
      .orderBy('created_at', 'desc')
      .first('status');
    latestPersonalVerificationStatus = latestPersonalVerification?.status ?? null;
  } catch (error) {
    logger.warn(
      { err: error, userId: input.resolvedUser.id, companySlug: input.companySlug },
      'Failed to resolve personal verification status during login nudges',
    );
  }

  const hasPendingPersonalVerification = latestPersonalVerificationStatus === 'pending';
  const shouldShowProfileCompletionReminder =
    !input.isSuperAdminFallback
    && input.resolvedUser.updated !== true
    && !hasPendingPersonalVerification;

  if (shouldShowProfileCompletionReminder) {
    await createAndDispatchNotification({
      userId: input.resolvedUser.id,
      companyId: input.companyId,
      title: 'Complete Your Profile',
      message: 'Please update your account profile settings with your personal information.',
      type: 'warning',
      linkUrl: '/account/profile',
    });
  } else if (!input.isSuperAdminFallback && (input.resolvedUser.updated === true || hasPendingPersonalVerification)) {
    await clearProfileCompletionReminder();
  }

  if (input.isSuperAdminFallback) return;

  if (input.resolvedUser.push_notifications_enabled === false) {
    await createAndDispatchNotification({
      userId: input.resolvedUser.id,
      companyId: input.companyId,
      title: 'Enable Push Notification',
      message: 'Please enable device push notifications in My Account > Settings.',
      type: 'warning',
      linkUrl: '/account/settings',
    });
  }

  const permissionSet = new Set(input.sessionPermissions);
  if (!permissionSet.has(PERMISSIONS.ACCOUNT_MANAGE_EMPLOYEE_REQUIREMENTS)) return;

  try {
    const totalResult = await db.getDb()('employment_requirement_types')
      .where({ is_active: true })
      .count('code as count')
      .first();
    const totalRequirements = Number(totalResult?.count ?? 0);

    if (totalRequirements > 0) {
      const submittedRows = await db.getDb()('employment_requirement_submissions')
        .where({ user_id: input.resolvedUser.id, company_id: input.companyId })
        .distinct('requirement_code');
      const submittedCount = submittedRows.length;

      if (submittedCount === 0) {
        await createAndDispatchNotification({
          userId: input.resolvedUser.id,
          companyId: input.companyId,
          title: 'Submit Your Requirements',
          message: 'Please submit your employment requirements in My Account > Profile.',
          type: 'warning',
          linkUrl: '/account/profile',
        });
      } else if (submittedCount < totalRequirements) {
        const remaining = totalRequirements - submittedCount;
        await createAndDispatchNotification({
          userId: input.resolvedUser.id,
          companyId: input.companyId,
          title: 'Complete Your Requirements',
          message: `You have submitted ${submittedCount} of ${totalRequirements} employment requirements. Please submit the remaining ${remaining}.`,
          type: 'warning',
          linkUrl: '/account/profile',
        });
      }
    }
  } catch (error) {
    logger.warn(
      { err: error, userId: input.resolvedUser.id, companySlug: input.companySlug },
      'Failed to evaluate employment requirement progress notification on login',
    );
  }
}

async function issueCompanySession(input: {
  resolvedUser: any;
  company: CompanyRow;
  isSuperAdmin: boolean;
  includeLoginNudges: boolean;
  isSuperAdminFallback?: boolean;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  companySlug: string;
  companyThemeColor: string;
  companyName: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    employeeNumber: number | null;
    roles: any[];
    permissions: string[];
    branchIds: string[];
  };
}> {
  const { roles, permissions: rolePermissions } = await loadGlobalUserRolesAndPermissions(
    input.resolvedUser.id,
  );
  const permissions = input.isSuperAdmin
    ? await loadAllPermissionKeys()
    : rolePermissions;
  const branchIds = await loadUserAssignedBranchIds(input.resolvedUser.id, input.isSuperAdmin);

  const accessToken = signAccessToken({
    sub: input.resolvedUser.id,
    companyId: input.company.id,
    companySlug: input.company.slug,
    roles: roles.map((r) => r.name),
    permissions,
    branchIds,
  });

  const refreshToken = signRefreshToken(input.resolvedUser.id, input.company.id);
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await db.getDb()('refresh_tokens').insert({
    user_id: input.resolvedUser.id,
    company_id: input.company.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await db.getDb()('users')
    .where({ id: input.resolvedUser.id })
    .update({
      last_login_at: new Date(),
      last_company_id: input.company.id,
      updated_at: new Date(),
    });

  if (input.includeLoginNudges) {
    await runLoginNudges({
      companyId: input.company.id,
      companySlug: input.company.slug,
      resolvedUser: input.resolvedUser,
      sessionPermissions: permissions,
      isSuperAdminFallback: Boolean(input.isSuperAdminFallback),
    });
  }

  return {
    accessToken,
    refreshToken,
    companySlug: input.company.slug,
    companyThemeColor: input.company.theme_color ?? '#2563EB',
    companyName: input.company.name,
    user: {
      id: input.resolvedUser.id,
      email: input.resolvedUser.email,
      firstName: input.resolvedUser.first_name,
      lastName: input.resolvedUser.last_name,
      avatarUrl: input.resolvedUser.avatar_url || null,
      employeeNumber: input.resolvedUser.employee_number ?? null,
      roles,
      permissions,
      branchIds,
    },
  };
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const [first, ...rest] = trimmed.split(/\s+/);
  return {
    firstName: first || 'Super',
    lastName: rest.length > 0 ? rest.join(' ') : 'Admin',
  };
}

async function ensureSuperAdminGlobalUser(input: {
  companyId?: string | null;
  superAdmin: SuperAdminRow;
}) {
  const { firstName, lastName } = splitName(input.superAdmin.name);
  const normalized = normalizeEmail(input.superAdmin.email);

  let user = await db.getDb()('users').whereRaw('LOWER(email) = ?', [normalized]).first();

  if (user) {
    const [updated] = await db.getDb()('users')
      .where({ id: user.id })
      .update({
        email: normalized,
        first_name: firstName,
        last_name: lastName,
        password_hash: input.superAdmin.password_hash,
        is_active: true,
        employment_status: 'active',
        updated_at: new Date(),
      })
      .returning('*');
    user = updated;
  } else {
    const [created] = await db.getDb()('users')
      .insert({
        email: normalized,
        password_hash: input.superAdmin.password_hash,
        first_name: firstName,
        last_name: lastName,
        is_active: true,
        employment_status: 'active',
      })
      .returning('*');
    user = created;
  }

  const adminRole = await db.getDb()('roles')
    .where({ name: SYSTEM_ROLES.ADMINISTRATOR })
    .first('id');
  if (!adminRole) {
    throw new AppError(500, 'Administrator role is not configured');
  }

  const hasRole = await db.getDb()('user_roles')
    .where({ user_id: user.id, role_id: adminRole.id })
    .first('id');
  if (!hasRole) {
    await db.getDb()('user_roles').insert({
      user_id: user.id,
      role_id: adminRole.id,
      assigned_by: null,
    });
  }

  if (input.companyId) {
    const access = await db.getDb()('user_company_access')
      .where({ user_id: user.id, company_id: input.companyId })
      .first('id');
    if (!access) {
      await db.getDb()('user_company_access').insert({
        user_id: user.id,
        company_id: input.companyId,
        is_active: true,
        updated_at: new Date(),
      });
    } else {
      await db.getDb()('user_company_access')
        .where({ id: access.id })
        .update({ is_active: true, updated_at: new Date() });
    }
  }

  return user;
}

export async function loginTenantUser(email: string, password: string, companySlug?: string) {
  await ensureSystemRolePermissionDefaults();
  const normalizedEmail = normalizeEmail(email);

  const superAdminByEmail = await db.getDb()('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizedEmail])
    .select('id', 'email', 'name', 'password_hash')
    .first() as SuperAdminRow | undefined;

  let user = await getGlobalUserByEmail(normalizedEmail);
  let isSuperAdmin = false;
  let isSuperAdminFallback = false;

  if (!user || !(await comparePassword(password, user.password_hash))) {
    if (!superAdminByEmail || !(await comparePassword(password, superAdminByEmail.password_hash))) {
      throw new AppError(401, 'Invalid email or password');
    }

    user = await ensureSuperAdminGlobalUser({
      companyId: null,
      superAdmin: superAdminByEmail,
    });
    isSuperAdmin = true;
    isSuperAdminFallback = true;
    logger.info(
      { superAdminId: superAdminByEmail.id, companySlug, globalUserId: user?.id ?? null },
      'Super admin fallback login used',
    );
  } else if (superAdminByEmail) {
    isSuperAdmin = true;
  }

  const resolvedUser = user;
  if (!resolvedUser) {
    throw new AppError(500, 'Unable to resolve authenticated user');
  }

  if (!resolvedUser.is_active) {
    throw new AppError(401, 'Account is inactive');
  }

  if (isSuperAdmin) {
    await ensureAdministratorRoleAssignment(resolvedUser.id);
  }

  const selectedCompany = await resolveCompanyForLogin();

  return issueCompanySession({
    resolvedUser,
    company: selectedCompany,
    isSuperAdmin,
    includeLoginNudges: true,
    isSuperAdminFallback,
  });
}

export async function listLoginCompanies(userId: string): Promise<Array<{
  id: string;
  name: string;
  slug: string;
  themeColor: string | null;
}>> {
  const user = await db.getDb()('users').where({ id: userId, is_active: true }).first('id', 'email');
  if (!user) throw new AppError(401, 'User not found');

  const isSuperAdmin = Boolean(await db.getDb()('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizeEmail(String(user.email ?? ''))])
    .first('id'));

  const companies = await listAccessibleCompanies({
    userId,
    isSuperAdmin,
  });

  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    slug: company.slug,
    themeColor: company.theme_color,
  }));
}

export async function forgotPassword(email: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  const superAdmin = await db.getDb()('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizedEmail])
    .first('id');
  if (superAdmin) {
    throw new AppError(404, 'Email not found');
  }

  const user = await db.getDb()('users')
    .whereRaw('LOWER(email) = ?', [normalizedEmail])
    .andWhere({ is_active: true })
    .first('id', 'email', 'first_name', 'last_name');
  if (!user) {
    throw new AppError(404, 'Email not found');
  }

  const latestRequest = await db.getDb()('password_reset_tokens')
    .where({ user_id: user.id })
    .orderBy('created_at', 'desc')
    .first('created_at');
  if (latestRequest?.created_at) {
    const latestCreatedAt = new Date(latestRequest.created_at).getTime();
    const cooldownEndsAt = latestCreatedAt + PASSWORD_RESET_COOLDOWN_MINUTES * 60 * 1000;
    if (cooldownEndsAt > now.getTime()) {
      throw new AppError(429, 'You can request another password reset after 30 minutes');
    }
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_EXPIRES_MINUTES * 60 * 1000);
  const resetLink = buildPasswordResetUrl(token);
  const fullName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Omnilert user';

  await db.getDb()('password_reset_tokens').insert({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  try {
    await sendForgotPasswordEmail({
      to: user.email,
      fullName,
      email: user.email,
      resetLink,
      expiresInMinutes: PASSWORD_RESET_EXPIRES_MINUTES,
    });
  } catch (error) {
    await db.getDb()('password_reset_tokens').where({ token_hash: tokenHash }).delete();
    logger.error({ err: error, userId: user.id }, 'Failed to send password reset email');
    throw new AppError(502, 'Failed to send password reset email');
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashResetToken(token);
  const now = new Date();

  const resetToken = await db.getDb()('password_reset_tokens')
    .where({ token_hash: tokenHash })
    .whereNull('used_at')
    .where('expires_at', '>', now)
    .first('id', 'user_id');
  if (!resetToken) {
    throw new AppError(400, 'Password reset link is invalid or expired');
  }

  const user = await db.getDb()('users')
    .where({ id: resetToken.user_id, is_active: true })
    .first('id');
  if (!user) {
    throw new AppError(400, 'Password reset link is invalid or expired');
  }

  const passwordHash = await hashPassword(newPassword);

  await db.getDb().transaction(async (trx) => {
    await trx('users')
      .where({ id: resetToken.user_id })
      .update({ password_hash: passwordHash, updated_at: now });

    await trx('password_reset_tokens')
      .where({ user_id: resetToken.user_id })
      .whereNull('used_at')
      .update({ used_at: now });

    await trx('refresh_tokens')
      .where({ user_id: resetToken.user_id, is_revoked: false })
      .update({ is_revoked: true });
  });
}

/** @deprecated Company switching is no longer used. Always resolves to the Omnilert root company. */
export async function switchCompany(userId: string, _companySlug: string) {
  await ensureSystemRolePermissionDefaults();
  const user = await db.getDb()('users').where({ id: userId, is_active: true }).first();
  if (!user) throw new AppError(401, 'User not found');

  const isSuperAdmin = Boolean(await db.getDb()('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizeEmail(String(user.email ?? ''))])
    .first('id'));
  if (isSuperAdmin) {
    await ensureAdministratorRoleAssignment(user.id as string);
  }

  const selectedCompany = await resolveCompanyForLogin();

  return issueCompanySession({
    resolvedUser: user,
    company: selectedCompany,
    isSuperAdmin,
    includeLoginNudges: false,
  });
}

export async function refreshTokens(refreshTokenStr: string) {
  const payload = verifyRefreshToken(refreshTokenStr);
  await ensureSystemRolePermissionDefaults();
  const company = await db.getDb()('companies')
    .where({ id: payload.companyId, is_active: true })
    .first();
  if (!company) {
    throw new AppError(401, 'Company is no longer available');
  }

  const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');
  const storedToken = await db.getDb()('refresh_tokens')
    .where({ token_hash: tokenHash, is_revoked: false })
    .where('expires_at', '>', new Date())
    .first();

  if (!storedToken) {
    throw new AppError(401, 'Invalid refresh token');
  }

  await db.getDb()('refresh_tokens').where({ id: storedToken.id }).update({ is_revoked: true });

  const user = await db.getDb()('users').where({ id: payload.sub, is_active: true }).first();
  if (!user) {
    throw new AppError(401, 'User not found');
  }

  const isSuperAdmin = Boolean(await db.getDb()('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizeEmail(String(user.email ?? ''))])
    .first('id'));

  if (isSuperAdmin) {
    await ensureAdministratorRoleAssignment(user.id as string);
  }

  const { roles, permissions: rolePermissions } = await loadGlobalUserRolesAndPermissions(user.id as string);
  const permissions = isSuperAdmin
    ? await loadAllPermissionKeys()
    : rolePermissions;
  const branchIds = await loadUserAssignedBranchIds(user.id as string, isSuperAdmin);

  const newAccessToken = signAccessToken({
    sub: user.id,
    companyId: company.id,
    companySlug: company.slug,
    roles: roles.map((r) => r.name),
    permissions,
    branchIds,
  });

  const newRefreshToken = signRefreshToken(user.id, company.id);
  const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  await db.getDb()('refresh_tokens').insert({
    user_id: user.id,
    company_id: company.id,
    token_hash: newTokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshTokenStr: string) {
  try {
    verifyRefreshToken(refreshTokenStr);
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');
    await db.getDb()('refresh_tokens').where({ token_hash: tokenHash }).update({ is_revoked: true });
  } catch {
    // Token already invalid, that's fine.
  }
}
