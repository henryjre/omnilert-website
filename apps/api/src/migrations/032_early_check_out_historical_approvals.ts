import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('shift_authorizations')
    .where({ auth_type: 'early_check_out', status: 'no_approval_needed' })
    .update({
      status: 'approved',
      resolved_by: null,
      resolved_at: knex.fn.now(),
    });
}

export async function down(knex: Knex): Promise<void> {
  await knex('shift_authorizations')
    .where({ auth_type: 'early_check_out', status: 'approved' })
    .whereNull('resolved_by')
    .update({
      status: 'no_approval_needed',
      resolved_at: null,
    });
}
