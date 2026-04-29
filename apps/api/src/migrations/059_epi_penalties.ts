import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasRewardRequests = await knex.schema.hasTable('reward_requests');
  if (hasRewardRequests) {
    const hasSourceViolationNoticeId = await knex.schema.hasColumn(
      'reward_requests',
      'source_violation_notice_id',
    );

    if (!hasSourceViolationNoticeId) {
      await knex.schema.alterTable('reward_requests', (table) => {
        table
          .uuid('source_violation_notice_id')
          .nullable()
          .references('id')
          .inTable('violation_notices')
          .onDelete('SET NULL');
      });
    }

    await knex.raw(`
      UPDATE reward_requests rr
      SET source_violation_notice_id = vn.id
      FROM violation_notices vn
      WHERE rr.source_violation_notice_id IS NULL
        AND rr.epi_delta < 0
        AND rr.reason = CONCAT('VN-', LPAD(vn.vn_number::text, 4, '0'))
        AND rr.company_id = vn.company_id
    `);

    await knex.raw(`
      UPDATE reward_request_targets rrt
      SET
        epi_delta = COALESCE(rrt.epi_delta, rr.epi_delta),
        applied_at = COALESCE(rrt.applied_at, rr.reviewed_at, rr.updated_at)
      FROM reward_requests rr
      WHERE rrt.reward_request_id = rr.id
        AND rr.status = 'approved'
        AND (rrt.epi_delta IS NULL OR rrt.applied_at IS NULL)
    `);

    await knex.raw(`
      CREATE INDEX IF NOT EXISTS reward_requests_source_vn_idx
      ON reward_requests (source_violation_notice_id)
    `);
  }

  const hasSnapshots = await knex.schema.hasTable('employee_metric_daily_snapshots');
  if (hasSnapshots) {
    const hasPenaltiesCount = await knex.schema.hasColumn(
      'employee_metric_daily_snapshots',
      'penalties_count',
    );
    const hasPenaltiesTotalDecrease = await knex.schema.hasColumn(
      'employee_metric_daily_snapshots',
      'penalties_total_decrease',
    );

    if (!hasPenaltiesCount || !hasPenaltiesTotalDecrease) {
      await knex.schema.alterTable('employee_metric_daily_snapshots', (table) => {
        if (!hasPenaltiesCount) table.integer('penalties_count').notNullable().defaultTo(0);
        if (!hasPenaltiesTotalDecrease) {
          table.decimal('penalties_total_decrease', 7, 2).notNullable().defaultTo(0);
        }
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSnapshots = await knex.schema.hasTable('employee_metric_daily_snapshots');
  if (hasSnapshots) {
    const hasPenaltiesCount = await knex.schema.hasColumn(
      'employee_metric_daily_snapshots',
      'penalties_count',
    );
    const hasPenaltiesTotalDecrease = await knex.schema.hasColumn(
      'employee_metric_daily_snapshots',
      'penalties_total_decrease',
    );

    if (hasPenaltiesCount || hasPenaltiesTotalDecrease) {
      await knex.schema.alterTable('employee_metric_daily_snapshots', (table) => {
        if (hasPenaltiesTotalDecrease) table.dropColumn('penalties_total_decrease');
        if (hasPenaltiesCount) table.dropColumn('penalties_count');
      });
    }
  }

  const hasRewardRequests = await knex.schema.hasTable('reward_requests');
  if (hasRewardRequests) {
    await knex.raw('DROP INDEX IF EXISTS reward_requests_source_vn_idx');

    const hasSourceViolationNoticeId = await knex.schema.hasColumn(
      'reward_requests',
      'source_violation_notice_id',
    );
    if (hasSourceViolationNoticeId) {
      await knex.schema.alterTable('reward_requests', (table) => {
        table.dropColumn('source_violation_notice_id');
      });
    }
  }
}
