import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('case_reports', (table) => {
    table.uuid('branch_id').nullable().references('id').inTable('branches').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('case_reports', (table) => {
    table.dropColumn('branch_id');
  });
}
