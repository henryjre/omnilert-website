import type { Knex } from 'knex';

const PERMISSION_KEY = 'account.submit_employee_requirements';
const PERMISSION_CATEGORY = 'account';
const SERVICE_CREW_ROLE = 'Service Crew';

function permissionName(key: string): string {
  return key
    .split('.')
    .pop()!
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function up(knex: Knex): Promise<void> {
  let permission = await knex('permissions')
    .where({ key: PERMISSION_KEY })
    .first('id');

  if (!permission) {
    [permission] = await knex('permissions')
      .insert({
        key: PERMISSION_KEY,
        name: permissionName(PERMISSION_KEY),
        description: `Permission: ${PERMISSION_KEY}`,
        category: PERMISSION_CATEGORY,
      })
      .returning('id');
  }

  const serviceCrewRole = await knex('roles')
    .where({ name: SERVICE_CREW_ROLE })
    .first('id');

  if (permission && serviceCrewRole) {
    await knex('role_permissions')
      .insert({
        role_id: serviceCrewRole.id,
        permission_id: permission.id,
      })
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }
}

export async function down(knex: Knex): Promise<void> {
  const permission = await knex('permissions')
    .where({ key: PERMISSION_KEY })
    .first('id');

  if (!permission) return;

  await knex('role_permissions')
    .where({ permission_id: permission.id })
    .delete();

  await knex('permissions')
    .where({ id: permission.id })
    .delete();
}
