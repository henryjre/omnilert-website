import type { Knex } from 'knex';

const USERS_TABLE = 'users';
const PUSH_ENABLED_COLUMN = 'push_notifications_enabled';
const PUSH_SUBSCRIPTIONS_TABLE = 'push_subscriptions';
const PUSH_SUBSCRIPTIONS_ENDPOINT_UNIQUE = 'push_subscriptions_endpoint_unique';
const PUSH_SUBSCRIPTIONS_USER_IDX = 'push_subscriptions_user_id_idx';

export async function up(knex: Knex): Promise<void> {
  const hasPushEnabledColumn = await knex.schema.hasColumn(USERS_TABLE, PUSH_ENABLED_COLUMN);
  if (!hasPushEnabledColumn) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.boolean(PUSH_ENABLED_COLUMN).notNullable().defaultTo(true);
    });
  }

  const hasPushSubscriptionsTable = await knex.schema.hasTable(PUSH_SUBSCRIPTIONS_TABLE);
  if (!hasPushSubscriptionsTable) {
    await knex.schema.createTable(PUSH_SUBSCRIPTIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable(USERS_TABLE).onDelete('CASCADE');
      table.text('endpoint').notNullable();
      table.text('p256dh').notNullable();
      table.text('auth').notNullable();
      table.text('user_agent').nullable();
      table.boolean('is_active').notNullable().defaultTo(true);
      table.integer('failure_count').notNullable().defaultTo(0);
      table.timestamp('last_success_at').nullable();
      table.timestamp('last_failure_at').nullable();
      table.text('last_failure_reason').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['endpoint'], { indexName: PUSH_SUBSCRIPTIONS_ENDPOINT_UNIQUE });
      table.index(['user_id'], PUSH_SUBSCRIPTIONS_USER_IDX);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPushSubscriptionsTable = await knex.schema.hasTable(PUSH_SUBSCRIPTIONS_TABLE);
  if (hasPushSubscriptionsTable) {
    await knex.schema.dropTable(PUSH_SUBSCRIPTIONS_TABLE);
  }

  const hasPushEnabledColumn = await knex.schema.hasColumn(USERS_TABLE, PUSH_ENABLED_COLUMN);
  if (hasPushEnabledColumn) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn(PUSH_ENABLED_COLUMN);
    });
  }
}
