import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE shift_logs
      DROP CONSTRAINT IF EXISTS shift_logs_log_type_check;
  `);
  await knex.raw(`
    ALTER TABLE shift_logs
      ADD CONSTRAINT shift_logs_log_type_check
      CHECK (log_type IN ('shift_updated', 'check_in', 'check_out', 'shift_ended', 'authorization_resolved'));
  `);

  await knex.raw(`
    ALTER TABLE shift_authorizations
      DROP CONSTRAINT IF EXISTS shift_authorizations_auth_type_check;
  `);
  await knex.raw(`
    ALTER TABLE shift_authorizations
      ADD CONSTRAINT shift_authorizations_auth_type_check
      CHECK (auth_type IN ('early_check_in', 'tardiness', 'early_check_out', 'late_check_out', 'overtime'));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE shift_logs
      DROP CONSTRAINT IF EXISTS shift_logs_log_type_check;
  `);
  await knex.raw(`
    ALTER TABLE shift_logs
      ADD CONSTRAINT shift_logs_log_type_check
      CHECK (log_type IN ('shift_updated', 'check_in', 'check_out'));
  `);

  await knex.raw(`
    ALTER TABLE shift_authorizations
      DROP CONSTRAINT IF EXISTS shift_authorizations_auth_type_check;
  `);
  await knex.raw(`
    ALTER TABLE shift_authorizations
      ADD CONSTRAINT shift_authorizations_auth_type_check
      CHECK (auth_type IN ('early_check_in', 'tardiness', 'early_check_out', 'late_check_out'));
  `);
}
