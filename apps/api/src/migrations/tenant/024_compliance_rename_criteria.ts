import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('store_audits', (table) => {
    table.renameColumn('comp_non_idle', 'comp_productivity_rate');
    table.dropColumn('comp_cellphone');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('store_audits', (table) => {
    table.renameColumn('comp_productivity_rate', 'comp_non_idle');
    table.boolean('comp_cellphone').nullable();
  });
}
