import type { Knex } from 'knex';

const CONSTRAINT_NAME = 'violation_notices_category_check';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE violation_notices DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME};
    ALTER TABLE violation_notices
      ADD CONSTRAINT ${CONSTRAINT_NAME}
      CHECK (category IN ('manual', 'case_reports', 'store_audits', 'aic_variance'));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex('violation_notices')
    .where({ category: 'aic_variance' })
    .update({ category: 'manual' });

  await knex.raw(`
    ALTER TABLE violation_notices DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME};
    ALTER TABLE violation_notices
      ADD CONSTRAINT ${CONSTRAINT_NAME}
      CHECK (category IN ('manual', 'case_reports', 'store_audits'));
  `);
}
