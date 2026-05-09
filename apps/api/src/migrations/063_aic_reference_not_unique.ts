import type { Knex } from 'knex';

const TABLE_NAME = 'aic_records';
const CONSTRAINT_NAME = 'aic_records_company_reference_unique';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE ${TABLE_NAME} ADD CONSTRAINT ${CONSTRAINT_NAME} UNIQUE (company_id, reference)`,
  );
}
