import type { Knex } from 'knex';

const SYSTEM_ROLES = {
  ADMINISTRATOR: 'Administrator',
  MANAGEMENT: 'Management',
} as const;

const PERMISSIONS = {
  CASE_REPORT_VIEW: 'case_report.view',
  CASE_REPORT_CREATE: 'case_report.create',
  CASE_REPORT_CLOSE: 'case_report.close',
  CASE_REPORT_MANAGE: 'case_report.manage',
} as const;

const PERMISSION_KEYS = [
  PERMISSIONS.CASE_REPORT_VIEW,
  PERMISSIONS.CASE_REPORT_CREATE,
  PERMISSIONS.CASE_REPORT_CLOSE,
  PERMISSIONS.CASE_REPORT_MANAGE,
] as const;

function permissionName(key: string): string {
  return key
    .split('.')
    .pop()!
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function up(knex: Knex): Promise<void> {
  for (const key of PERMISSION_KEYS) {
    const existing = await knex('permissions').where({ key }).first('id');
    if (!existing) {
      await knex('permissions').insert({
        key,
        name: permissionName(key),
        description: `Permission: ${key}`,
        category: 'case_report',
      });
    }
  }

  const roles = await knex('roles')
    .whereIn('name', [SYSTEM_ROLES.ADMINISTRATOR, SYSTEM_ROLES.MANAGEMENT])
    .select('id', 'name');

  const permissions = await knex('permissions')
    .whereIn('key', [...PERMISSION_KEYS])
    .select('id', 'key');

  for (const role of roles) {
    const allowedKeys = role.name === SYSTEM_ROLES.MANAGEMENT
      ? PERMISSION_KEYS.filter((key) => key !== PERMISSIONS.CASE_REPORT_MANAGE)
      : PERMISSION_KEYS;

    for (const permission of permissions.filter((item) => allowedKeys.includes(item.key))) {
      await knex('role_permissions')
        .insert({ role_id: role.id, permission_id: permission.id })
        .onConflict(['role_id', 'permission_id'])
        .ignore();
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const permissions = await knex('permissions')
    .whereIn('key', [...PERMISSION_KEYS])
    .select('id');

  if (permissions.length > 0) {
    await knex('role_permissions')
      .whereIn('permission_id', permissions.map((permission) => permission.id))
      .delete();
  }

  await knex('permissions').whereIn('key', [...PERMISSION_KEYS]).delete();
}
