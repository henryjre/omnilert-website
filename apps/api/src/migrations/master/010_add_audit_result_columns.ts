import type { Knex } from 'knex';

const USERS_TABLE = 'users';
const PERMISSIONS_TABLE = 'permissions';
const ROLES_TABLE = 'roles';
const ROLE_PERMISSIONS_TABLE = 'role_permissions';

const CSS_AUDITS_COLUMN = 'css_audits';
const COMPLIANCE_AUDIT_COLUMN = 'compliance_audit';

const PERMISSION_KEYS = [
  'store_audit.view',
  'store_audit.process',
] as const;

function permissionName(key: string): string {
  return key
    .split('.')
    .pop()!
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function up(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasCssAudits = await knex.schema.hasColumn(USERS_TABLE, CSS_AUDITS_COLUMN);
  if (!hasCssAudits) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.jsonb(CSS_AUDITS_COLUMN).nullable().defaultTo(knex.raw(`'[]'::jsonb`));
    });
  }

  const hasComplianceAudit = await knex.schema.hasColumn(USERS_TABLE, COMPLIANCE_AUDIT_COLUMN);
  if (!hasComplianceAudit) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.jsonb(COMPLIANCE_AUDIT_COLUMN).nullable().defaultTo(knex.raw(`'{}'::jsonb`));
    });
  }

  const hasPermissionsTable = await knex.schema.hasTable(PERMISSIONS_TABLE);
  if (!hasPermissionsTable) return;

  for (const key of PERMISSION_KEYS) {
    const existing = await knex(PERMISSIONS_TABLE).where({ key }).first('id');
    if (!existing) {
      await knex(PERMISSIONS_TABLE).insert({
        key,
        name: permissionName(key),
        description: `Permission: ${key}`,
        category: 'store_audit',
      });
    }
  }

  const hasRolesTable = await knex.schema.hasTable(ROLES_TABLE);
  const hasRolePermissionsTable = await knex.schema.hasTable(ROLE_PERMISSIONS_TABLE);
  if (!hasRolesTable || !hasRolePermissionsTable) return;

  const roles = await knex(ROLES_TABLE)
    .whereIn('name', ['Administrator', 'Management'])
    .select('id', 'name');
  if (roles.length === 0) return;

  const permissions = await knex(PERMISSIONS_TABLE)
    .whereIn('key', [...PERMISSION_KEYS])
    .select('id', 'key');

  for (const role of roles) {
    for (const permission of permissions) {
      const existing = await knex(ROLE_PERMISSIONS_TABLE)
        .where({ role_id: role.id, permission_id: permission.id })
        .first('id');
      if (!existing) {
        await knex(ROLE_PERMISSIONS_TABLE).insert({
          role_id: role.id,
          permission_id: permission.id,
        });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasRolePermissionsTable = await knex.schema.hasTable(ROLE_PERMISSIONS_TABLE);
  const hasPermissionsTable = await knex.schema.hasTable(PERMISSIONS_TABLE);

  if (hasPermissionsTable) {
    const permissions = await knex(PERMISSIONS_TABLE)
      .whereIn('key', [...PERMISSION_KEYS])
      .select('id');

    if (hasRolePermissionsTable && permissions.length > 0) {
      await knex(ROLE_PERMISSIONS_TABLE)
        .whereIn('permission_id', permissions.map((permission) => permission.id))
        .delete();
    }

    await knex(PERMISSIONS_TABLE).whereIn('key', [...PERMISSION_KEYS]).delete();
  }

  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasComplianceAudit = await knex.schema.hasColumn(USERS_TABLE, COMPLIANCE_AUDIT_COLUMN);
  const hasCssAudits = await knex.schema.hasColumn(USERS_TABLE, CSS_AUDITS_COLUMN);

  if (hasComplianceAudit || hasCssAudits) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      if (hasComplianceAudit) table.dropColumn(COMPLIANCE_AUDIT_COLUMN);
      if (hasCssAudits) table.dropColumn(CSS_AUDITS_COLUMN);
    });
  }
}
