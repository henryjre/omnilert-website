import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Rename epi_points → epi_delta, widen to DECIMAL(5,2), replace positive-only CHECK with non-zero CHECK
  await knex.raw(`
    ALTER TABLE reward_requests
      RENAME COLUMN epi_points TO epi_delta
  `);

  await knex.raw(`
    ALTER TABLE reward_requests
      ALTER COLUMN epi_delta TYPE DECIMAL(5,2)
  `);

  // Drop old positive-range constraint if it exists
  await knex.raw(`
    DO $$
    DECLARE
      con_name text;
    BEGIN
      SELECT conname INTO con_name
      FROM pg_constraint
      WHERE conrelid = 'reward_requests'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%epi_%';
      IF con_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE reward_requests DROP CONSTRAINT %I', con_name);
      END IF;
    END
    $$
  `);

  await knex.raw(`
    ALTER TABLE reward_requests
      ADD CONSTRAINT reward_requests_epi_delta_nonzero CHECK (epi_delta <> 0)
  `);

  // Widen reward_request_targets.epi_delta to DECIMAL(5,2) to allow negative values
  await knex.raw(`
    ALTER TABLE reward_request_targets
      ALTER COLUMN epi_delta TYPE DECIMAL(5,2)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE reward_request_targets
      ALTER COLUMN epi_delta TYPE DECIMAL(3,1)
  `);

  await knex.raw(`
    ALTER TABLE reward_requests
      DROP CONSTRAINT IF EXISTS reward_requests_epi_delta_nonzero
  `);

  await knex.raw(`
    ALTER TABLE reward_requests
      ADD CONSTRAINT reward_requests_epi_points_positive CHECK (epi_delta > 0 AND epi_delta <= 5)
  `);

  await knex.raw(`
    ALTER TABLE reward_requests
      ALTER COLUMN epi_delta TYPE DECIMAL(3,1)
  `);

  await knex.raw(`
    ALTER TABLE reward_requests
      RENAME COLUMN epi_delta TO epi_points
  `);
}
