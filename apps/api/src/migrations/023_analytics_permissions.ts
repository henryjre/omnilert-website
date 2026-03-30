import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';

const PERMISSION_KEY = 'analytics.view_employee_analytics';
const ROLE_ADMIN = 'Administrator';
const ROLE_MANAGEMENT = 'Management';

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // 1. Insert the new permission
    const [permission] = await trx('permissions')
      .insert({
        id: uuidv4(),
        key: PERMISSION_KEY,
        name: 'View Employee Analytics',
        description: 'Access the Employee Analytics page and view performance metrics',
        category: 'analytics',
      })
      .onConflict('key')
      .merge(['name', 'description', 'category'])
      .returning('*');

    const permId = permission?.id || (await trx('permissions').where({ key: PERMISSION_KEY }).first('id'))?.id;

    if (!permId) return;

    // 2. Assign to roles
    const roles = await trx('roles')
      .whereIn('name', [ROLE_ADMIN, ROLE_MANAGEMENT])
      .select('id');

    if (roles.length > 0) {
      await trx('role_permissions')
        .insert(
          roles.map((role) => ({
            role_id: role.id as string,
            permission_id: permId as string,
          })),
        )
        .onConflict(['role_id', 'permission_id'])
        .ignore();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const permission = await knex('permissions').where({ key: PERMISSION_KEY }).first('id');
  if (!permission) return;

  await knex('role_permissions').where({ permission_id: permission.id }).delete();
  await knex('permissions').where({ id: permission.id }).delete();
}
