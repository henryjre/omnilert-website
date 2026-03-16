import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('store_audits', 'vn_requested');
  if (!hasColumn) {
    await knex.schema.alterTable('store_audits', (table) => {
      table.boolean('vn_requested').notNullable().defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('store_audits', 'vn_requested');
  if (hasColumn) {
    await knex.schema.alterTable('store_audits', (table) => {
      table.dropColumn('vn_requested');
    });
  }
}
