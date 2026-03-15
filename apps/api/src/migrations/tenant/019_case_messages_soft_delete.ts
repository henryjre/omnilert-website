import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasIsDeleted = await knex.schema.hasColumn('case_messages', 'is_deleted');
  if (!hasIsDeleted) {
    await knex.schema.alterTable('case_messages', (table) => {
      table.boolean('is_deleted').notNullable().defaultTo(false);
      table.uuid('deleted_by').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('case_messages', (table) => {
    table.dropColumn('is_deleted');
    table.dropColumn('deleted_by');
  });
}
