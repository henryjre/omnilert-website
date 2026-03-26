import type { Knex } from 'knex';

const TABLE_NAME = 'pos_verifications';
const CONSTRAINT_NAME = 'pos_verifications_status_check';

const UP_ALLOWED_STATUSES = [
  'pending',
  'awaiting_customer',
  'confirmed',
  'rejected',
];

const DOWN_ALLOWED_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
];

function buildStatusConstraint(allowedStatuses: string[]): string {
  const values = allowedStatuses.map((value) => `'${value}'`).join(', ');
  return `
    ALTER TABLE ${TABLE_NAME}
    ADD CONSTRAINT ${CONSTRAINT_NAME}
    CHECK (status IN (${values}))
  `;
}

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ${TABLE_NAME}
    DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}
  `);

  await knex.raw(buildStatusConstraint(UP_ALLOWED_STATUSES));
}

export async function down(knex: Knex): Promise<void> {
  await knex(TABLE_NAME)
    .where({ status: 'awaiting_customer' })
    .update({ status: 'pending' });

  await knex.raw(`
    ALTER TABLE ${TABLE_NAME}
    DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}
  `);

  await knex.raw(buildStatusConstraint(DOWN_ALLOWED_STATUSES));
}
