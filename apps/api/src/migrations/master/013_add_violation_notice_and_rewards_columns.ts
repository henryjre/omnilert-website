import type { Knex } from 'knex';

const USERS_TABLE = 'users';
const VIOLATION_NOTICES_COLUMN = 'violation_notices';
const REWARDS_COLUMN = 'rewards';

export async function up(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasViolationNotices = await knex.schema.hasColumn(USERS_TABLE, VIOLATION_NOTICES_COLUMN);
  if (!hasViolationNotices) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.jsonb(VIOLATION_NOTICES_COLUMN).nullable().defaultTo(knex.raw(`'[]'::jsonb`));
    });
  }

  const hasRewards = await knex.schema.hasColumn(USERS_TABLE, REWARDS_COLUMN);
  if (!hasRewards) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.jsonb(REWARDS_COLUMN).nullable().defaultTo(knex.raw(`'[]'::jsonb`));
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasViolationNotices = await knex.schema.hasColumn(USERS_TABLE, VIOLATION_NOTICES_COLUMN);
  const hasRewards = await knex.schema.hasColumn(USERS_TABLE, REWARDS_COLUMN);

  if (hasViolationNotices || hasRewards) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      if (hasViolationNotices) table.dropColumn(VIOLATION_NOTICES_COLUMN);
      if (hasRewards) table.dropColumn(REWARDS_COLUMN);
    });
  }
}
