import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('pending_transactions', (table) => {
    table.string('reason', 500).nullable();
    table.string('rejection_reason', 500).nullable();
    table
      .uuid('reviewed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('pending_transactions', (table) => {
    table.dropColumn('reason');
    table.dropColumn('rejection_reason');
    table.dropColumn('reviewed_by');
    table.dropColumn('reviewed_at');
  });
}
