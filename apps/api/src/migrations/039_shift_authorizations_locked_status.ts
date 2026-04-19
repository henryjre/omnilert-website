import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE shift_authorizations
      DROP CONSTRAINT IF EXISTS shift_authorizations_status_check;
    ALTER TABLE shift_authorizations
      ADD CONSTRAINT shift_authorizations_status_check
      CHECK (
        status IN (
          'pending',
          'approved',
          'rejected',
          'no_approval_needed',
          'locked'
        )
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE shift_authorizations
      DROP CONSTRAINT IF EXISTS shift_authorizations_status_check;
    ALTER TABLE shift_authorizations
      ADD CONSTRAINT shift_authorizations_status_check
      CHECK (
        status IN (
          'pending',
          'approved',
          'rejected',
          'no_approval_needed'
        )
      );
  `);
}
