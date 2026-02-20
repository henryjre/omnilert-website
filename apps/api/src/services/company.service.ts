import { db } from '../config/database.js';
import { provisionTenantDatabase } from './databaseProvisioner.js';
import { AppError } from '../middleware/errorHandler.js';
import { getTenantMigrationStatus, updateCompanyMigrationState } from './tenantMigration.service.js';

const DEFAULT_THEME_COLOR = '#2563EB';
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

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

export async function createCompany(
  name: string,
  admin: { email: string; password: string; firstName: string; lastName: string },
  odooApiKey?: string,
) {
  const masterDb = db.getMasterDb();
  const slug = slugify(name);
  const dbName = dbNameFromSlug(slug);

  // Check uniqueness
  const existing = await masterDb('companies').where({ slug }).first();
  if (existing) {
    throw new AppError(409, 'A company with this name already exists');
  }

  // Create company record
  const [company] = await masterDb('companies')
    .insert({
      name,
      slug,
      db_name: dbName,
      odoo_api_key: odooApiKey || null,
      theme_color: DEFAULT_THEME_COLOR,
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

  const [company] = await masterDb('companies')
    .insert({
      name,
      slug,
      db_name: dbName,
      odoo_api_key: odooApiKey || null,
      theme_color: DEFAULT_THEME_COLOR,
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
  data: { name?: string; isActive?: boolean; odooApiKey?: string; themeColor?: string },
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
  data: { name?: string; themeColor?: string; odooApiKey?: string },
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

  const [company] = await masterDb('companies')
    .where({ id: companyId })
    .update(updates)
    .returning('*');

  if (!company) throw new AppError(404, 'Company not found');
  return company;
}
