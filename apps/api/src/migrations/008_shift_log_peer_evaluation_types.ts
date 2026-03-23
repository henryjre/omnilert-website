import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE shift_logs
      DROP CONSTRAINT IF EXISTS shift_logs_log_type_check;
  `);
  await knex.raw(`
    ALTER TABLE shift_logs
      ADD CONSTRAINT shift_logs_log_type_check
      CHECK (
        log_type IN (
          'shift_updated',
          'check_in',
          'check_out',
          'shift_ended',
          'authorization_resolved',
          'peer_evaluation_available',
          'peer_evaluation_submitted',
          'peer_evaluation_expired'
        )
      );
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
      CHECK (log_type IN ('shift_updated', 'check_in', 'check_out', 'shift_ended', 'authorization_resolved'));
  `);
}
