import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('payroll_adjustment_requests', (table) => {
    table.uuid('created_by_user_id').nullable().alter();
  });

  await knex.schema.alterTable('reward_requests', (table) => {
    table.uuid('created_by').nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('payroll_adjustment_requests', (table) => {
    table.uuid('created_by_user_id').notNullable().alter();
  });

  await knex.schema.alterTable('reward_requests', (table) => {
    table.uuid('created_by').notNullable().alter();
  });
}
