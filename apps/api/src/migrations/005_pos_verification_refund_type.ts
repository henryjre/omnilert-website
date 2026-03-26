import type { Knex } from 'knex';

const TABLE_NAME = 'pos_verifications';
const CONSTRAINT_NAME = 'pos_verifications_verification_type_check';

const UP_ALLOWED_TYPES = [
  'cf_breakdown',
  'pcf_breakdown',
  'closing_pcf_breakdown',
  'discount_order',
  'refund_order',
  'token_pay_order',
  'ispe_purchase_order',
  'register_cash_in',
  'register_cash_out',
  'non_cash_order',
];

const DOWN_ALLOWED_TYPES = [
  'cf_breakdown',
  'pcf_breakdown',
  'closing_pcf_breakdown',
  'discount_order',
  'token_pay_order',
  'ispe_purchase_order',
  'register_cash_in',
  'register_cash_out',
  'non_cash_order',
];

function buildVerificationTypeConstraint(allowedTypes: string[]): string {
  const values = allowedTypes.map((value) => `'${value}'`).join(', ');
  return `
    ALTER TABLE ${TABLE_NAME}
    ADD CONSTRAINT ${CONSTRAINT_NAME}
    CHECK (
      verification_type IS NULL
      OR verification_type IN (${values})
    )
  `;
}

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ${TABLE_NAME}
    DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}
  `);

  await knex.raw(buildVerificationTypeConstraint(UP_ALLOWED_TYPES));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE ${TABLE_NAME}
    DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}
  `);

  await knex.raw(buildVerificationTypeConstraint(DOWN_ALLOWED_TYPES));
}
