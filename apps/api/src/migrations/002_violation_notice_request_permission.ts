import type { Knex } from 'knex';

const PERMISSION_KEY = 'violation_notice.request';
const ROLE_ADMIN = 'Administrator';
const ROLE_MANAGEMENT = 'Management';

export async function up(knex: Knex): Promise<void> {
  await knex('permissions')
    .insert({
      key: PERMISSION_KEY,
      name: 'Request',
      description: 'Can request violation notices from case reports and store audits',
      category: 'violation_notice',
    })
    .onConflict('key')
    .ignore();

  const permission = await knex('permissions').where({ key: PERMISSION_KEY }).first('id');
  if (!permission) return;

  const roleRows = await knex('roles')
    .whereIn('name', [ROLE_ADMIN, ROLE_MANAGEMENT])
    .select('id');

  if (roleRows.length === 0) return;

  await knex('role_permissions')
    .insert(roleRows.map((role: any) => ({
      role_id: String(role.id),
      permission_id: String(permission.id),
    })))
    .onConflict(['role_id', 'permission_id'])
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  const permission = await knex('permissions').where({ key: PERMISSION_KEY }).first('id');
  if (!permission) return;

  await knex('role_permissions').where({ permission_id: permission.id }).delete();
  await knex('permissions').where({ id: permission.id }).delete();
}
