import type { Knex } from 'knex';

const SYSTEM_ROLES = {
  ADMINISTRATOR: 'Administrator',
  MANAGEMENT: 'Management',
  SERVICE_CREW: 'Service Crew',
} as const;

const PERMISSIONS = {
  PEER_EVALUATION_VIEW: 'peer_evaluation.view',
  PEER_EVALUATION_MANAGE: 'peer_evaluation.manage',
} as const;

const PERMISSION_KEYS = [
  PERMISSIONS.PEER_EVALUATION_VIEW,
  PERMISSIONS.PEER_EVALUATION_MANAGE,
] as const;

const SERVICE_CREW_KEYS = [
  PERMISSIONS.PEER_EVALUATION_VIEW,
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
        category: 'peer_evaluation',
      });
    }
  }

  const roles = await knex('roles')
    .whereIn('name', [SYSTEM_ROLES.ADMINISTRATOR, SYSTEM_ROLES.MANAGEMENT, SYSTEM_ROLES.SERVICE_CREW])
    .select('id', 'name');

  const permissions = await knex('permissions')
    .whereIn('key', [...PERMISSION_KEYS])
    .select('id', 'key');

  for (const role of roles) {
    const allowedKeys =
      role.name === SYSTEM_ROLES.SERVICE_CREW
        ? SERVICE_CREW_KEYS
        : PERMISSION_KEYS;

    for (const permission of permissions.filter((item) => (allowedKeys as readonly string[]).includes(item.key))) {
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
