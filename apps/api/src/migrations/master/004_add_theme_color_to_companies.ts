import type { Knex } from 'knex';

const DEFAULT_THEME_COLOR = '#2563EB';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (table) => {
    table.string('theme_color', 7).notNullable().defaultTo(DEFAULT_THEME_COLOR);
  });

  await knex('companies')
    .whereNull('theme_color')
    .update({ theme_color: DEFAULT_THEME_COLOR });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (table) => {
    table.dropColumn('theme_color');
  });
}

