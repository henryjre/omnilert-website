import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';

const PERMISSIONS = [
  {
    key: 'rewards.view',
    name: 'View EPI Adjustment',
    description: 'Access the EPI Adjustment page and view adjustment requests',
    category: 'rewards',
  },
  {
    key: 'rewards.issue',
    name: 'Issue EPI Adjustment',
    description: 'Submit EPI adjustment requests',
    category: 'rewards',
  },
  {
    key: 'rewards.manage',
    name: 'Manage EPI Adjustment',
    description: 'Approve and reject EPI adjustment requests',
    category: 'rewards',
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const perm of PERMISSIONS) {
      await trx('permissions')
        .insert({
          id: uuidv4(),
          key: perm.key,
          name: perm.name,
          description: perm.description,
          category: perm.category,
        })
        .onConflict('key')
        .merge(['name', 'description', 'category']);
    }
  });

  await knex.schema.createTable('reward_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.decimal('epi_points', 3, 1).notNullable();
    table.text('reason').notNullable();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'approved', 'rejected']);
    table
      .uuid('created_by')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .uuid('reviewed_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('reviewed_at', { useTz: true }).nullable();
    table.text('rejection_reason').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('reward_request_targets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('reward_request_id')
      .notNullable()
      .references('id')
      .inTable('reward_requests')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.decimal('epi_before', 5, 2).nullable();
    table.decimal('epi_after', 5, 2).nullable();
    table.decimal('epi_delta', 3, 1).nullable();
    table.timestamp('applied_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX reward_request_targets_request_user_unique
    ON reward_request_targets (reward_request_id, user_id)
  `);
  await knex.raw(`
    CREATE INDEX reward_requests_company_status_created_idx
    ON reward_requests (company_id, status, created_at DESC)
  `);
  await knex.raw(`
    CREATE INDEX reward_request_targets_user_applied_idx
    ON reward_request_targets (user_id, applied_at)
  `);

  const hasSnapshots = await knex.schema.hasTable('employee_metric_daily_snapshots');
  if (hasSnapshots) {
    const hasAwardsTotalIncrease = await knex.schema.hasColumn(
      'employee_metric_daily_snapshots',
      'awards_total_increase',
    );
    if (!hasAwardsTotalIncrease) {
      await knex.schema.alterTable('employee_metric_daily_snapshots', (table) => {
        table.decimal('awards_total_increase', 7, 2).notNullable().defaultTo(0);
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSnapshots = await knex.schema.hasTable('employee_metric_daily_snapshots');
  if (hasSnapshots) {
    const hasAwardsTotalIncrease = await knex.schema.hasColumn(
      'employee_metric_daily_snapshots',
      'awards_total_increase',
    );
    if (hasAwardsTotalIncrease) {
      await knex.schema.alterTable('employee_metric_daily_snapshots', (table) => {
        table.dropColumn('awards_total_increase');
      });
    }
  }

  await knex.raw('DROP INDEX IF EXISTS reward_request_targets_user_applied_idx');
  await knex.raw('DROP INDEX IF EXISTS reward_requests_company_status_created_idx');
  await knex.raw('DROP INDEX IF EXISTS reward_request_targets_request_user_unique');
  await knex.schema.dropTableIfExists('reward_request_targets');
  await knex.schema.dropTableIfExists('reward_requests');

  await knex('permissions')
    .whereIn(
      'key',
      PERMISSIONS.map((p) => p.key),
    )
    .delete();
}
