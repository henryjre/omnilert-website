import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('shift_activities', (table) => {
    table.boolean('is_calculated').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('shift_activities', (table) => {
    table.dropColumn('is_calculated');
  });
}
