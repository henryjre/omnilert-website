import type { Knex } from 'knex';

const TABLE_NAME = 'store_audits';
const CONSTRAINT_NAME = 'store_audits_status_check';
const REJECTED_AT_COLUMN = 'rejected_at';
const REJECTION_REASON_COLUMN = 'rejection_reason';

const UP_ALLOWED_STATUSES = [
  'pending',
  'processing',
  'completed',
  'rejected',
];

const DOWN_ALLOWED_STATUSES = [
  'pending',
  'processing',
  'completed',
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
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) return;

  const hasRejectedAt = await knex.schema.hasColumn(TABLE_NAME, REJECTED_AT_COLUMN);
  const hasRejectionReason = await knex.schema.hasColumn(TABLE_NAME, REJECTION_REASON_COLUMN);

  if (!hasRejectedAt || !hasRejectionReason) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      if (!hasRejectedAt) {
        table.timestamp(REJECTED_AT_COLUMN, { useTz: true }).nullable();
      }
      if (!hasRejectionReason) {
        table.text(REJECTION_REASON_COLUMN).nullable();
      }
    });
  }

  await knex.raw(`
    ALTER TABLE ${TABLE_NAME}
    DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}
  `);

  await knex.raw(buildStatusConstraint(UP_ALLOWED_STATUSES));
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) return;

  await knex(TABLE_NAME)
    .where({ status: 'rejected' })
    .update({
      status: 'pending',
      [REJECTED_AT_COLUMN]: null,
      [REJECTION_REASON_COLUMN]: null,
    });

  await knex.raw(`
    ALTER TABLE ${TABLE_NAME}
    DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}
  `);

  await knex.raw(buildStatusConstraint(DOWN_ALLOWED_STATUSES));

  const hasRejectedAt = await knex.schema.hasColumn(TABLE_NAME, REJECTED_AT_COLUMN);
  const hasRejectionReason = await knex.schema.hasColumn(TABLE_NAME, REJECTION_REASON_COLUMN);

  if (hasRejectedAt || hasRejectionReason) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      if (hasRejectedAt) {
        table.dropColumn(REJECTED_AT_COLUMN);
      }
      if (hasRejectionReason) {
        table.dropColumn(REJECTION_REASON_COLUMN);
      }
    });
  }
}
