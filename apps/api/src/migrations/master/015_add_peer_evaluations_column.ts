import type { Knex } from 'knex';

const USERS_TABLE = 'users';
const PEER_EVALUATIONS_COLUMN = 'peer_evaluations';

export async function up(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasPeerEvaluations = await knex.schema.hasColumn(USERS_TABLE, PEER_EVALUATIONS_COLUMN);
  if (!hasPeerEvaluations) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.jsonb(PEER_EVALUATIONS_COLUMN).nullable().defaultTo(knex.raw(`'[]'::jsonb`));
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasPeerEvaluations = await knex.schema.hasColumn(USERS_TABLE, PEER_EVALUATIONS_COLUMN);
  if (hasPeerEvaluations) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn(PEER_EVALUATIONS_COLUMN);
    });
  }
}
