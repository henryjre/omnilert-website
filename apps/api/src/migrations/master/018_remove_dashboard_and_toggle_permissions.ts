import type { Knex } from 'knex';

const PERMISSIONS_TABLE = 'permissions';
const ROLE_PERMISSIONS_TABLE = 'role_permissions';
const ROLES_TABLE = 'roles';

const REMOVED_PERMISSIONS = [
  {
    key: 'admin.toggle_branch',
    name: 'Toggle Branch',
    category: 'admin',
    grantRolesOnDown: ['Administrator', 'Management'],
  },
  {
    key: 'dashboard.view',
    name: 'View Dashboard',
    category: 'dashboard',
    grantRolesOnDown: ['Administrator', 'Management', 'Service Crew'],
  },
] as const;

export async function up(knex: Knex): Promise<void> {
  const hasPermissionsTable = await knex.schema.hasTable(PERMISSIONS_TABLE);
  if (!hasPermissionsTable) return;

  const permissionRows = await knex(PERMISSIONS_TABLE)
    .whereIn('key', REMOVED_PERMISSIONS.map((permission) => permission.key))
    .select('id');

  if (permissionRows.length === 0) return;

  if (await knex.schema.hasTable(ROLE_PERMISSIONS_TABLE)) {
    await knex(ROLE_PERMISSIONS_TABLE)
      .whereIn('permission_id', permissionRows.map((row) => row.id))
      .delete();
  }

  await knex(PERMISSIONS_TABLE)
    .whereIn('id', permissionRows.map((row) => row.id))
    .delete();
}

export async function down(knex: Knex): Promise<void> {
  const hasPermissionsTable = await knex.schema.hasTable(PERMISSIONS_TABLE);
  if (!hasPermissionsTable) return;

  for (const permission of REMOVED_PERMISSIONS) {
    let row = await knex(PERMISSIONS_TABLE).where({ key: permission.key }).first('id');
    if (!row) {
      const [inserted] = await knex(PERMISSIONS_TABLE)
        .insert({
          key: permission.key,
          name: permission.name,
          description: `Permission: ${permission.key}`,
          category: permission.category,
        })
        .returning('id');
      row = inserted;
    }

    if (!row || !(await knex.schema.hasTable(ROLE_PERMISSIONS_TABLE)) || !(await knex.schema.hasTable(ROLES_TABLE))) {
      continue;
    }

    const roles = await knex(ROLES_TABLE)
      .whereIn('name', permission.grantRolesOnDown)
      .select('id');

    for (const role of roles) {
      await knex(ROLE_PERMISSIONS_TABLE)
        .insert({ role_id: role.id, permission_id: row.id })
        .onConflict(['role_id', 'permission_id'])
        .ignore();
    }
  }
}

