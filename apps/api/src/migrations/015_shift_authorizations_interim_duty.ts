import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE shift_authorizations
      DROP CONSTRAINT IF EXISTS shift_authorizations_auth_type_check;
  `);
  await knex.raw(`
    ALTER TABLE shift_authorizations
      ADD CONSTRAINT shift_authorizations_auth_type_check
      CHECK (
        auth_type IN (
          'early_check_in',
          'tardiness',
          'early_check_out',
          'late_check_out',
          'overtime',
          'interim_duty'
        )
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE shift_authorizations
      DROP CONSTRAINT IF EXISTS shift_authorizations_auth_type_check;
  `);
  await knex.raw(`
    ALTER TABLE shift_authorizations
      ADD CONSTRAINT shift_authorizations_auth_type_check
      CHECK (
        auth_type IN (
          'early_check_in',
          'tardiness',
          'early_check_out',
          'late_check_out',
          'overtime'
        )
      );
  `);
}

