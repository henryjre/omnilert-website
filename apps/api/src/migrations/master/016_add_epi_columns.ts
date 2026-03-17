import type { Knex } from 'knex';

const USERS_TABLE = 'users';

export async function up(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasEpiScore = await knex.schema.hasColumn(USERS_TABLE, 'epi_score');
  if (!hasEpiScore) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.decimal('epi_score', 5, 1).notNullable().defaultTo(100.0);
    });
  }

  const hasEpiHistory = await knex.schema.hasColumn(USERS_TABLE, 'epi_history');
  if (!hasEpiHistory) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.jsonb('epi_history').nullable().defaultTo(knex.raw(`'[]'::jsonb`));
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasEpiHistory = await knex.schema.hasColumn(USERS_TABLE, 'epi_history');
  if (hasEpiHistory) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('epi_history');
    });
  }

  const hasEpiScore = await knex.schema.hasColumn(USERS_TABLE, 'epi_score');
  if (hasEpiScore) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('epi_score');
    });
  }
}
