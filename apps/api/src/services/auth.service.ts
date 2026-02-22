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
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from '@omnilert/shared';
import { createAndDispatchNotification } from './notification.service.js';
import {
  getGlobalUserByEmail,
  loadGlobalUserRolesAndPermissions,
  normalizeEmail,
} from './globalUser.service.js';

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
  db_name: string;
  theme_color: string | null;
}

let systemRoleDefaultsEnsured = false;

async function ensureAdministratorRoleAssignment(masterDb: any, userId: string): Promise<void> {
  const adminRole = await masterDb('roles')
    .where({ name: SYSTEM_ROLES.ADMINISTRATOR })
    .first('id');
  if (!adminRole) return;

  const existingRole = await masterDb('user_roles')
    .where({ user_id: userId, role_id: adminRole.id })
    .first('id');
  if (!existingRole) {
    await masterDb('user_roles').insert({
      user_id: userId,
      role_id: adminRole.id,
      assigned_by: null,
    });
  }
}

async function loadAllPermissionKeys(masterDb: any): Promise<string[]> {
  const rows = await masterDb('permissions').select('key');
  return rows.map((row: any) => String(row.key));
}

async function ensureSystemRolePermissionDefaults(masterDb: any): Promise<void> {
  if (systemRoleDefaultsEnsured) return;

  const roleRows = await masterDb('roles')
    .whereIn('name', Object.keys(DEFAULT_ROLE_PERMISSIONS))
    .select('id', 'name');
  if (roleRows.length === 0) {
    systemRoleDefaultsEnsured = true;
    return;
  }

  const permissionRows = await masterDb('permissions')
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
    await masterDb('role_permissions')
      .insert(inserts)
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }

  systemRoleDefaultsEnsured = true;
}

async function loadAllActiveBranchIdsForCompany(companyDbName: string): Promise<string[]> {
  const tenantDb = await db.getTenantDb(companyDbName);
  const rows = await tenantDb('branches')
    .where({ is_active: true })
    .select('id');
  return rows.map((row: any) => row.id as string);
}

async function listAccessibleCompanies(input: {
  masterDb: any;
  userId: string;
  isSuperAdmin: boolean;
}): Promise<CompanyRow[]> {
  if (input.isSuperAdmin) {
    const rows = await input.masterDb('companies')
      .where({ is_active: true })
      .select('id', 'name', 'slug', 'db_name', 'theme_color')
      .orderBy('name', 'asc')
      .orderBy('created_at', 'asc');
    return rows as CompanyRow[];
  }

  const rows = await input.masterDb('user_company_access as uca')
    .join('companies as companies', 'uca.company_id', 'companies.id')
    .where('uca.user_id', input.userId)
    .andWhere('uca.is_active', true)
    .andWhere('companies.is_active', true)
    .select(
      'companies.id',
      'companies.name',
      'companies.slug',
      'companies.db_name',
      'companies.theme_color',
    )
    .orderBy('companies.name', 'asc')
    .orderBy('companies.created_at', 'asc');

  return rows as CompanyRow[];
}

async function resolveCompanyForLogin(input: {
  masterDb: any;
  user: any;
  isSuperAdmin: boolean;
  companySlug?: string;
}): Promise<CompanyRow> {
  if (input.companySlug) {
    const requested = await input.masterDb('companies')
      .where({ slug: input.companySlug, is_active: true })
      .first('id', 'name', 'slug', 'db_name', 'theme_color');
    if (!requested) {
      throw new AppError(404, 'Company not found');
    }
    if (!input.isSuperAdmin) {
      const hasCompanyAccess = await input.masterDb('user_company_access')
        .where({ user_id: input.user.id, company_id: requested.id, is_active: true })
        .first('id');
      if (!hasCompanyAccess) {
        throw new AppError(403, 'You are not assigned to this company');
      }
    }
    return requested as CompanyRow;
  }

  const accessible = await listAccessibleCompanies({
    masterDb: input.masterDb,
    userId: input.user.id as string,
    isSuperAdmin: input.isSuperAdmin,
  });

  if (accessible.length === 0) {
    throw new AppError(403, 'No accessible company assigned');
  }

  const lastCompanyId = (input.user.last_company_id as string | null) ?? null;
  if (lastCompanyId) {
    const preferred = accessible.find((company) => company.id === lastCompanyId);
    if (preferred) return preferred;
  }

  return accessible[0];
}

async function runLoginNudges(input: {
  tenantDb: any;
  resolvedUser: any;
  isSuperAdminFallback: boolean;
  companySlug: string;
}): Promise<void> {
  if (!input.isSuperAdminFallback && input.resolvedUser.updated !== true) {
    await createAndDispatchNotification({
      tenantDb: input.tenantDb,
      userId: input.resolvedUser.id,
      title: 'Complete Your Profile',
      message: 'Please update your account profile settings with your personal information.',
      type: 'warning',
      linkUrl: '/account/profile',
    });
  }

  if (input.isSuperAdminFallback) return;

  try {
    const hasRequirementTypesTable = await input.tenantDb.schema.hasTable('employment_requirement_types');
    const hasRequirementSubmissionsTable = await input.tenantDb.schema.hasTable('employment_requirement_submissions');

    if (hasRequirementTypesTable && hasRequirementSubmissionsTable) {
      const totalResult = await input.tenantDb('employment_requirement_types')
        .where({ is_active: true })
        .count('code as count')
        .first();
      const totalRequirements = Number(totalResult?.count ?? 0);

      if (totalRequirements > 0) {
        const submittedRows = await input.tenantDb('employment_requirement_submissions')
          .where({ user_id: input.resolvedUser.id })
          .distinct('requirement_code');
        const submittedCount = submittedRows.length;

        if (submittedCount === 0) {
          await createAndDispatchNotification({
            tenantDb: input.tenantDb,
            userId: input.resolvedUser.id,
            title: 'Submit Your Requirements',
            message: 'Please submit your employment requirements in My Account > Profile.',
            type: 'warning',
            linkUrl: '/account/profile',
          });
        } else if (submittedCount < totalRequirements) {
          const remaining = totalRequirements - submittedCount;
          await createAndDispatchNotification({
            tenantDb: input.tenantDb,
            userId: input.resolvedUser.id,
            title: 'Complete Your Requirements',
            message: `You have submitted ${submittedCount} of ${totalRequirements} employment requirements. Please submit the remaining ${remaining}.`,
            type: 'warning',
            linkUrl: '/account/profile',
          });
        }
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
  masterDb: any;
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
    input.masterDb,
    input.resolvedUser.id,
  );
  const permissions = input.isSuperAdmin
    ? await loadAllPermissionKeys(input.masterDb)
    : rolePermissions;
  const branchIds = await loadAllActiveBranchIdsForCompany(String(input.company.db_name));

  const accessToken = signAccessToken({
    sub: input.resolvedUser.id,
    companyId: input.company.id,
    companySlug: input.company.slug,
    companyDbName: input.company.db_name,
    roles: roles.map((r) => r.name),
    permissions,
    branchIds,
  });

  const refreshToken = signRefreshToken(input.resolvedUser.id, input.company.db_name);
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await input.masterDb('refresh_tokens').insert({
    user_id: input.resolvedUser.id,
    company_id: input.company.id,
    company_db_name: input.company.db_name,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await input.masterDb('users')
    .where({ id: input.resolvedUser.id })
    .update({
      last_login_at: new Date(),
      last_company_id: input.company.id,
      updated_at: new Date(),
    });

  if (input.includeLoginNudges) {
    const tenantDb = await db.getTenantDb(input.company.db_name as string);
    await runLoginNudges({
      tenantDb,
      resolvedUser: input.resolvedUser,
      isSuperAdminFallback: Boolean(input.isSuperAdminFallback),
      companySlug: input.company.slug,
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
  masterDb: any;
  companyId?: string | null;
  companyDbName?: string | null;
  superAdmin: SuperAdminRow;
}) {
  const { firstName, lastName } = splitName(input.superAdmin.name);
  const normalized = normalizeEmail(input.superAdmin.email);

  let user = await input.masterDb('users').whereRaw('LOWER(email) = ?', [normalized]).first();

  if (user) {
    const [updated] = await input.masterDb('users')
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
    const [created] = await input.masterDb('users')
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

  const adminRole = await input.masterDb('roles')
    .where({ name: SYSTEM_ROLES.ADMINISTRATOR })
    .first('id');
  if (!adminRole) {
    throw new AppError(500, 'Administrator role is not configured');
  }

  const hasRole = await input.masterDb('user_roles')
    .where({ user_id: user.id, role_id: adminRole.id })
    .first('id');
  if (!hasRole) {
    await input.masterDb('user_roles').insert({
      user_id: user.id,
      role_id: adminRole.id,
      assigned_by: null,
    });
  }

  if (input.companyId) {
    const access = await input.masterDb('user_company_access')
      .where({ user_id: user.id, company_id: input.companyId })
      .first('id');
    if (!access) {
      await input.masterDb('user_company_access').insert({
        user_id: user.id,
        company_id: input.companyId,
        is_active: true,
        updated_at: new Date(),
      });
    } else {
      await input.masterDb('user_company_access')
        .where({ id: access.id })
        .update({ is_active: true, updated_at: new Date() });
    }
  }

  return user;
}

export async function loginTenantUser(email: string, password: string, companySlug?: string) {
  const masterDb = db.getMasterDb();
  await ensureSystemRolePermissionDefaults(masterDb);
  const normalizedEmail = normalizeEmail(email);

  const superAdminByEmail = await masterDb('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizedEmail])
    .select('id', 'email', 'name', 'password_hash')
    .first() as SuperAdminRow | undefined;

  let user = await getGlobalUserByEmail(masterDb, normalizedEmail);
  let isSuperAdmin = false;
  let isSuperAdminFallback = false;

  if (!user || !(await comparePassword(password, user.password_hash))) {
    if (!superAdminByEmail || !(await comparePassword(password, superAdminByEmail.password_hash))) {
      throw new AppError(401, 'Invalid email or password');
    }

    user = await ensureSuperAdminGlobalUser({
      masterDb,
      companyId: null,
      companyDbName: null,
      superAdmin: superAdminByEmail,
    });
    isSuperAdmin = true;
    isSuperAdminFallback = true;
    logger.info(
      { superAdminId: superAdminByEmail.id, companySlug, globalUserId: user?.id ?? null },
      'Super admin fallback login used',
    );
  } else if (superAdminByEmail) {
    // Super admins can access all companies without explicit company assignment rows.
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
    await ensureAdministratorRoleAssignment(masterDb, resolvedUser.id);
  }

  const selectedCompany = await resolveCompanyForLogin({
    masterDb,
    user: resolvedUser,
    isSuperAdmin,
    companySlug,
  });

  if (isSuperAdminFallback) {
    await masterDb('user_company_access')
      .insert({
        user_id: resolvedUser.id,
        company_id: selectedCompany.id,
        is_active: true,
        updated_at: new Date(),
      })
      .onConflict(['user_id', 'company_id'])
      .merge({ is_active: true, updated_at: new Date() });
  }

  return issueCompanySession({
    masterDb,
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
  const masterDb = db.getMasterDb();
  const user = await masterDb('users').where({ id: userId, is_active: true }).first('id', 'email');
  if (!user) throw new AppError(401, 'User not found');

  const isSuperAdmin = Boolean(await masterDb('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizeEmail(String(user.email ?? ''))])
    .first('id'));

  const companies = await listAccessibleCompanies({
    masterDb,
    userId: userId,
    isSuperAdmin,
  });

  return companies.map((company) => ({
    id: company.id,
    name: company.name,
    slug: company.slug,
    themeColor: company.theme_color,
  }));
}

export async function switchCompany(userId: string, companySlug: string) {
  const masterDb = db.getMasterDb();
  await ensureSystemRolePermissionDefaults(masterDb);
  const user = await masterDb('users').where({ id: userId, is_active: true }).first();
  if (!user) throw new AppError(401, 'User not found');

  const isSuperAdmin = Boolean(await masterDb('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizeEmail(String(user.email ?? ''))])
    .first('id'));
  if (isSuperAdmin) {
    await ensureAdministratorRoleAssignment(masterDb, user.id as string);
  }

  const selectedCompany = await resolveCompanyForLogin({
    masterDb,
    user,
    isSuperAdmin,
    companySlug,
  });

  return issueCompanySession({
    masterDb,
    resolvedUser: user,
    company: selectedCompany,
    isSuperAdmin,
    includeLoginNudges: false,
  });
}

export async function refreshTokens(refreshTokenStr: string) {
  const payload = verifyRefreshToken(refreshTokenStr);
  const masterDb = db.getMasterDb();
  await ensureSystemRolePermissionDefaults(masterDb);
  const company = await masterDb('companies')
    .where({ db_name: payload.companyDbName, is_active: true })
    .first();
  if (!company) {
    throw new AppError(401, 'Company is no longer available');
  }

  const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');
  const storedToken = await masterDb('refresh_tokens')
    .where({ token_hash: tokenHash, is_revoked: false })
    .where('expires_at', '>', new Date())
    .first();

  if (!storedToken) {
    throw new AppError(401, 'Invalid refresh token');
  }

  await masterDb('refresh_tokens').where({ id: storedToken.id }).update({ is_revoked: true });

  const user = await masterDb('users').where({ id: payload.sub, is_active: true }).first();
  if (!user) {
    throw new AppError(401, 'User not found');
  }

  const isSuperAdmin = Boolean(await masterDb('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizeEmail(String(user.email ?? ''))])
    .first('id'));

  if (isSuperAdmin) {
    await ensureAdministratorRoleAssignment(masterDb, user.id as string);
  }

  const { roles, permissions: rolePermissions } = await loadGlobalUserRolesAndPermissions(masterDb, user.id as string);
  const permissions = isSuperAdmin
    ? await loadAllPermissionKeys(masterDb)
    : rolePermissions;
  const branchIds = await loadAllActiveBranchIdsForCompany(String(company.db_name));

  const newAccessToken = signAccessToken({
    sub: user.id,
    companyId: company.id,
    companySlug: company.slug,
    companyDbName: company.db_name,
    roles: roles.map((r) => r.name),
    permissions,
    branchIds,
  });

  const newRefreshToken = signRefreshToken(user.id, payload.companyDbName);
  const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  await masterDb('refresh_tokens').insert({
    user_id: user.id,
    company_id: company.id,
    company_db_name: payload.companyDbName,
    token_hash: newTokenHash,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshTokenStr: string) {
  try {
    verifyRefreshToken(refreshTokenStr);
    const masterDb = db.getMasterDb();
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');
    await masterDb('refresh_tokens').where({ token_hash: tokenHash }).update({ is_revoked: true });
  } catch {
    // Token already invalid, that's fine.
  }
}
