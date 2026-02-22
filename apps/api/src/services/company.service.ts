import { db } from '../config/database.js';
import { provisionTenantDatabase } from './databaseProvisioner.js';
import { AppError } from '../middleware/errorHandler.js';
import { getTenantMigrationStatus, updateCompanyMigrationState } from './tenantMigration.service.js';
import { deleteFile, deleteFolder, deletePrefixRecursive, getCompanyStorageRoot } from './storage.service.js';
import * as superAdminService from './superAdmin.service.js';
import { getIO } from '../config/socket.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const DEFAULT_THEME_COLOR = '#2563EB';
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const COMPANY_CODE_RE = /^[A-Z0-9]{2,10}$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function dbNameFromSlug(slug: string): string {
  return `omnilert_${slug.replace(/-/g, '_')}`;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  const [first, ...rest] = trimmed.split(/\s+/);
  return {
    firstName: first || 'Super',
    lastName: rest.length > 0 ? rest.join(' ') : 'Admin',
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase();
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function collectDistinctUrls(
  tenantDb: any,
  tableName: string,
  columnName: string,
): Promise<string[]> {
  const hasTable = await tenantDb.schema.hasTable(tableName);
  if (!hasTable) return [];
  const hasColumn = await tenantDb.schema.hasColumn(tableName, columnName);
  if (!hasColumn) return [];

  const rows = await tenantDb(tableName)
    .whereNotNull(columnName)
    .select(columnName)
    .distinct();

  return rows
    .map((row: Record<string, unknown>) => String(row[columnName] ?? '').trim())
    .filter((value: string) => value.length > 0);
}

async function collectTenantManagedFileUrls(tenantDb: any): Promise<string[]> {
  const urlSet = new Set<string>();
  const tableColumnPairs = [
    ['users', 'avatar_url'],
    ['users', 'valid_id_url'],
    ['cash_requests', 'attachment_url'],
    ['personal_information_verifications', 'valid_id_url'],
    ['employment_requirement_submissions', 'document_url'],
    ['pos_verification_images', 'file_path'],
  ] as const;

  for (const [tableName, columnName] of tableColumnPairs) {
    const urls = await collectDistinctUrls(tenantDb, tableName, columnName);
    for (const url of urls) {
      urlSet.add(url);
    }
  }

  return Array.from(urlSet);
}

async function cleanupQueueRecordsForCompanyDb(companyDbName: string): Promise<{ warning: string | null }> {
  const schema = env.QUEUE_SCHEMA;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    return { warning: `Skipping queue cleanup: invalid queue schema "${schema}"` };
  }

  const masterDb = db.getMasterDb();
  const quotedSchema = quoteIdentifier(schema);
  const jobTableRef = `${schema}.job`;
  const archiveTableRef = `${schema}.archive`;

  try {
    const jobReg = await masterDb.raw('SELECT to_regclass(?) as reg', [jobTableRef]);
    const archiveReg = await masterDb.raw('SELECT to_regclass(?) as reg', [archiveTableRef]);
    const hasJobTable = Boolean(jobReg?.rows?.[0]?.reg);
    const hasArchiveTable = Boolean(archiveReg?.rows?.[0]?.reg);

    if (hasJobTable) {
      await masterDb.raw(
        `DELETE FROM ${quotedSchema}.job WHERE data->>'companyDbName' = ?`,
        [companyDbName],
      );
    }
    if (hasArchiveTable) {
      await masterDb.raw(
        `DELETE FROM ${quotedSchema}.archive WHERE data->>'companyDbName' = ?`,
        [companyDbName],
      );
    }

    return { warning: null };
  } catch (error) {
    logger.warn(
      { err: error, companyDbName, queueSchema: schema },
      'Queue cleanup failed during company delete',
    );
    return { warning: 'Queue cleanup failed. Pending background jobs may still reference deleted company data.' };
  }
}

async function deleteManagedFiles(urls: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const url of urls) {
    try {
      const ok = await deleteFile(url);
      if (!ok) failed.push(url);
    } catch {
      failed.push(url);
    }
  }
  return failed;
}

interface LegacyFolderCleanupResult {
  attemptedCount: number;
  failedFolders: string[];
}

async function cleanupLegacyUserFolders(userIds: string[]): Promise<LegacyFolderCleanupResult> {
  const failedFolders: string[] = [];
  let attemptedCount = 0;
  const legacyRoots = [
    'Cash Requests',
    'Employment Requirements',
    'Valid IDs',
    'Profile Pictures',
  ];

  for (const userId of userIds) {
    for (const legacyRoot of legacyRoots) {
      const folder = `${legacyRoot}/${userId}`;
      attemptedCount += 1;
      try {
        const ok = await deleteFolder(folder);
        if (!ok) {
          failedFolders.push(folder);
        }
      } catch {
        failedFolders.push(folder);
      }
    }
  }

  return { attemptedCount, failedFolders };
}

function emitForceLogoutToUsers(userIds: string[], companyId: string, excludeUserId?: string): void {
  if (userIds.length === 0) return;
  const payload = {
    companyId,
    reason: 'Company has been deleted. Your session was ended.',
    timestamp: new Date().toISOString(),
  };

  try {
    const notificationNs = getIO().of('/notifications');
    for (const userId of userIds) {
      if (excludeUserId && userId === excludeUserId) continue;
      notificationNs.to(`user:${userId}`).emit('auth:force-logout', payload);
    }
  } catch {
    // best effort only
  }
}

export async function createCompany(
  name: string,
  admin: { email: string; password: string; firstName: string; lastName: string },
  odooApiKey?: string,
  companyCode?: string,
) {
  const masterDb = db.getMasterDb();
  const slug = slugify(name);
  const dbName = dbNameFromSlug(slug);

  // Check uniqueness
  const existing = await masterDb('companies').where({ slug }).first();
  if (existing) {
    throw new AppError(409, 'A company with this name already exists');
  }

  const normalizedCompanyCode = companyCode ? companyCode.trim().toUpperCase() : null;
  if (normalizedCompanyCode && !COMPANY_CODE_RE.test(normalizedCompanyCode)) {
    throw new AppError(400, 'Company code must be 2-10 uppercase letters/numbers');
  }

  // Create company record
  const [company] = await masterDb('companies')
    .insert({
      name,
      slug,
      db_name: dbName,
      odoo_api_key: odooApiKey || null,
      theme_color: DEFAULT_THEME_COLOR,
      company_code: normalizedCompanyCode,
    })
    .returning('*');

  // Provision tenant database with initial admin user
  await provisionTenantDatabase(dbName, admin);

  // Track current tenant migration version in master metadata
  const tenantDb = await db.getTenantDb(dbName);
  const status = await getTenantMigrationStatus(tenantDb);
  await updateCompanyMigrationState(company.id as string, dbName, status.currentVersion);

  return company;
}

export async function createCompanyForSuperAdmin(
  name: string,
  superAdminId: string,
  odooApiKey?: string,
  companyCode?: string,
) {
  const masterDb = db.getMasterDb();
  const slug = slugify(name);
  const dbName = dbNameFromSlug(slug);

  const existing = await masterDb('companies').where({ slug }).first();
  if (existing) {
    throw new AppError(409, 'A company with this name already exists');
  }

  const superAdmin = await masterDb('super_admins')
    .where({ id: superAdminId })
    .select('id', 'email', 'name', 'password_hash')
    .first();
  if (!superAdmin) {
    throw new AppError(404, 'Super admin not found');
  }

  const normalizedCompanyCode = companyCode ? companyCode.trim().toUpperCase() : null;
  if (normalizedCompanyCode && !COMPANY_CODE_RE.test(normalizedCompanyCode)) {
    throw new AppError(400, 'Company code must be 2-10 uppercase letters/numbers');
  }

  const [company] = await masterDb('companies')
    .insert({
      name,
      slug,
      db_name: dbName,
      odoo_api_key: odooApiKey || null,
      theme_color: DEFAULT_THEME_COLOR,
      company_code: normalizedCompanyCode,
    })
    .returning('*');

  const { firstName, lastName } = splitName(superAdmin.name as string);
  await provisionTenantDatabase(dbName, {
    email: superAdmin.email as string,
    firstName,
    lastName,
    passwordHash: superAdmin.password_hash as string,
  });

  const tenantDb = await db.getTenantDb(dbName);
  const status = await getTenantMigrationStatus(tenantDb);
  await updateCompanyMigrationState(company.id as string, dbName, status.currentVersion);

  return company;
}

export async function listCompanies() {
  const masterDb = db.getMasterDb();
  return masterDb('companies').orderBy('created_at', 'desc');
}

export async function listCompaniesPublic() {
  const masterDb = db.getMasterDb();
  return masterDb('companies')
    .where({ is_active: true })
    .select('id', 'name', 'slug', 'theme_color')
    .orderBy('name', 'asc');
}

export async function getCompany(id: string) {
  const masterDb = db.getMasterDb();
  const company = await masterDb('companies').where({ id }).first();
  if (!company) {
    throw new AppError(404, 'Company not found');
  }
  return company;
}

export async function updateCompany(
  id: string,
  data: { name?: string; isActive?: boolean; odooApiKey?: string; themeColor?: string; companyCode?: string },
) {
  const masterDb = db.getMasterDb();
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.isActive !== undefined) updates.is_active = data.isActive;
  if (data.odooApiKey !== undefined) updates.odoo_api_key = data.odooApiKey;
  if (data.themeColor !== undefined) {
    if (!HEX_COLOR_RE.test(data.themeColor)) {
      throw new AppError(400, 'themeColor must be a valid hex color (#RRGGBB)');
    }
    updates.theme_color = data.themeColor.toUpperCase();
  }
  if (data.companyCode !== undefined) {
    const normalized = data.companyCode.trim().toUpperCase();
    if (!COMPANY_CODE_RE.test(normalized)) {
      throw new AppError(400, 'Company code must be 2-10 uppercase letters/numbers');
    }
    updates.company_code = normalized;
  }

  const [company] = await masterDb('companies').where({ id }).update(updates).returning('*');
  if (!company) {
    throw new AppError(404, 'Company not found');
  }
  return company;
}

export async function getCurrentCompany(companyId: string) {
  const masterDb = db.getMasterDb();
  const company = await masterDb('companies').where({ id: companyId }).first();
  if (!company) throw new AppError(404, 'Company not found');
  return company;
}

export async function updateCurrentCompany(
  companyId: string,
  data: { name?: string; themeColor?: string; odooApiKey?: string; companyCode?: string },
) {
  const masterDb = db.getMasterDb();
  const updates: Record<string, unknown> = { updated_at: new Date() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.odooApiKey !== undefined) updates.odoo_api_key = data.odooApiKey;

  if (data.themeColor !== undefined) {
    if (!HEX_COLOR_RE.test(data.themeColor)) {
      throw new AppError(400, 'themeColor must be a valid hex color (#RRGGBB)');
    }
    updates.theme_color = data.themeColor.toUpperCase();
  }

  if (data.companyCode !== undefined) {
    const normalized = data.companyCode.trim().toUpperCase();
    if (!COMPANY_CODE_RE.test(normalized)) {
      throw new AppError(400, 'Company code must be 2-10 uppercase letters/numbers');
    }
    updates.company_code = normalized;
  }

  const [company] = await masterDb('companies')
    .where({ id: companyId })
    .update(updates)
    .returning('*');

  if (!company) throw new AppError(404, 'Company not found');
  return company;
}

export async function canUserDeleteCompany(
  companyId: string,
  userId: string,
): Promise<boolean> {
  const masterDb = db.getMasterDb();
  const company = await masterDb('companies')
    .where({ id: companyId, is_active: true })
    .select('db_name')
    .first();
  if (!company) return false;

  try {
    const user = await masterDb('users')
      .where({ id: userId, is_active: true })
      .select('email')
      .first();
    if (!user?.email) return false;

    const superAdmin = await masterDb('super_admins')
      .whereRaw('LOWER(email) = ?', [normalizeEmail(user.email as string)])
      .select('id')
      .first();

    return Boolean(superAdmin);
  } catch {
    return false;
  }
}

interface DeleteCurrentCompanyInput {
  companyId: string;
  userId: string;
  typedCompanyName: string;
  superAdminEmail: string;
  superAdminPassword: string;
}

interface DeleteCurrentCompanyResult {
  companyId: string;
  companyName: string;
  dbName: string;
  warnings: string[];
}

export async function deleteCurrentCompany(
  input: DeleteCurrentCompanyInput,
): Promise<DeleteCurrentCompanyResult> {
  const masterDb = db.getMasterDb();
  const company = await masterDb('companies').where({ id: input.companyId }).first();
  if (!company) {
    throw new AppError(404, 'Company not found');
  }

  if (!company.is_active) {
    throw new AppError(409, 'Company is already inactive');
  }

  const tenantDb = await db.getTenantDb(company.db_name as string);
  const currentUser = await masterDb('users')
    .where({ id: input.userId, is_active: true })
    .select('email')
    .first();
  if (!currentUser?.email) {
    throw new AppError(403, 'Only a superuser account can delete this company');
  }

  const normalizedCurrentUserEmail = normalizeEmail(currentUser.email as string);
  const currentUserSuperAdmin = await masterDb('super_admins')
    .whereRaw('LOWER(email) = ?', [normalizedCurrentUserEmail])
    .select('id', 'email')
    .first();
  if (!currentUserSuperAdmin) {
    throw new AppError(403, 'Only a superuser account can delete this company');
  }

  const normalizedSubmittedEmail = normalizeEmail(input.superAdminEmail);
  if (normalizedSubmittedEmail !== normalizedCurrentUserEmail) {
    throw new AppError(403, 'Super admin re-auth must match your current account');
  }

  const verifiedSuperAdmin = await superAdminService.loginSuperAdmin(
    input.superAdminEmail,
    input.superAdminPassword,
  );
  if (normalizeEmail(verifiedSuperAdmin.email) !== normalizedCurrentUserEmail) {
    throw new AppError(403, 'Super admin re-auth must match your current account');
  }

  if (normalizeComparable(input.typedCompanyName) !== normalizeComparable(company.name as string)) {
    throw new AppError(400, 'Company name confirmation does not match');
  }

  await masterDb('companies')
    .where({ id: input.companyId })
    .update({ is_active: false, updated_at: new Date() });

  const tenantUserIds = await masterDb('user_company_access')
    .where({ company_id: input.companyId, is_active: true })
    .pluck('user_id') as string[];

  await masterDb('refresh_tokens')
    .where({ company_id: input.companyId, is_revoked: false })
    .update({ is_revoked: true });
  await masterDb('refresh_tokens')
    .where({ company_db_name: company.db_name as string, is_revoked: false })
    .whereNull('company_id')
    .update({ is_revoked: true });

  emitForceLogoutToUsers(tenantUserIds, input.companyId, input.userId);

  const companyStorageRoot = getCompanyStorageRoot(String(company.slug));
  const prefixDeleteResult = await deletePrefixRecursive(`${companyStorageRoot}/`);
  logger.info(
    {
      companyId: input.companyId,
      companySlug: company.slug,
      companyStorageRoot,
      prefix: prefixDeleteResult.prefix,
      attemptedCount: prefixDeleteResult.attemptedCount,
      deletedCount: prefixDeleteResult.deletedCount,
      failedCount: prefixDeleteResult.failedKeys.length,
      error: prefixDeleteResult.error ?? null,
    },
    'Company storage prefix cleanup completed',
  );

  const managedFileUrls = await collectTenantManagedFileUrls(tenantDb);
  const failedFileDeletes = await deleteManagedFiles(managedFileUrls);
  logger.info(
    {
      companyId: input.companyId,
      attemptedCount: managedFileUrls.length,
      failedCount: failedFileDeletes.length,
    },
    'Company legacy URL cleanup completed',
  );

  const legacyFolderCleanup = await cleanupLegacyUserFolders(tenantUserIds);
  logger.info(
    {
      companyId: input.companyId,
      attemptedCount: legacyFolderCleanup.attemptedCount,
      failedCount: legacyFolderCleanup.failedFolders.length,
    },
    'Company legacy folder cleanup completed',
  );

  const queueCleanup = await cleanupQueueRecordsForCompanyDb(company.db_name as string);

  await db.closeTenantDb(company.db_name as string);

  try {
    await db.terminateDatabaseConnections(company.db_name as string);
    if (await db.databaseExists(company.db_name as string)) {
      await db.dropDatabase(company.db_name as string);
    }
  } catch (error) {
    logger.error(
      { err: error, companyId: input.companyId, dbName: company.db_name },
      'Tenant database drop failed during company delete',
    );
    throw new AppError(
      500,
      'Company was deactivated but tenant database deletion failed. Please retry deletion or contact support.',
    );
  }

  await masterDb('companies').where({ id: input.companyId }).delete();

  const warnings: string[] = [];
  if (prefixDeleteResult.error) {
    warnings.push(`Tenant storage prefix cleanup failed: ${prefixDeleteResult.error}.`);
  } else if (prefixDeleteResult.failedKeys.length > 0) {
    warnings.push(
      `Some tenant storage objects could not be deleted by prefix cleanup (${prefixDeleteResult.failedKeys.length}).`,
    );
  }
  if (failedFileDeletes.length > 0) {
    warnings.push(
      `Some legacy URL-referenced files could not be deleted (${failedFileDeletes.length}).`,
    );
  }
  if (legacyFolderCleanup.failedFolders.length > 0) {
    warnings.push(
      `Some legacy user folders could not be deleted (${legacyFolderCleanup.failedFolders.length}).`,
    );
  }
  if (queueCleanup.warning) {
    warnings.push(queueCleanup.warning);
  }

  return {
    companyId: input.companyId,
    companyName: company.name as string,
    dbName: company.db_name as string,
    warnings,
  };
}
