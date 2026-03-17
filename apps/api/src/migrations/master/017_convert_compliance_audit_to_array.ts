import type { Knex } from 'knex';

const USERS_TABLE = 'users';

export async function up(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasColumn = await knex.schema.hasColumn(USERS_TABLE, 'compliance_audit');
  if (!hasColumn) return;

  // Convert any existing single-object compliance_audit to an array
  // Users with a non-null, non-empty object value get wrapped in an array
  await knex.raw(`
    UPDATE ${USERS_TABLE}
    SET compliance_audit = jsonb_build_array(compliance_audit)
    WHERE compliance_audit IS NOT NULL
      AND compliance_audit != 'null'::jsonb
      AND jsonb_typeof(compliance_audit) = 'object'
      AND compliance_audit != '{}'::jsonb
  `);

  // Set empty objects to empty array
  await knex.raw(`
    UPDATE ${USERS_TABLE}
    SET compliance_audit = '[]'::jsonb
    WHERE compliance_audit = '{}'::jsonb
      OR (compliance_audit IS NOT NULL AND jsonb_typeof(compliance_audit) = 'object' AND compliance_audit = '{}'::jsonb)
  `);

  // Change the column default to empty array
  await knex.raw(`
    ALTER TABLE ${USERS_TABLE}
    ALTER COLUMN compliance_audit SET DEFAULT '[]'::jsonb
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasColumn = await knex.schema.hasColumn(USERS_TABLE, 'compliance_audit');
  if (!hasColumn) return;

  // Revert default back to empty object
  await knex.raw(`
    ALTER TABLE ${USERS_TABLE}
    ALTER COLUMN compliance_audit SET DEFAULT '{}'::jsonb
  `);

  // Convert array back to single object (take first element, or empty object)
  await knex.raw(`
    UPDATE ${USERS_TABLE}
    SET compliance_audit = CASE
      WHEN jsonb_typeof(compliance_audit) = 'array' AND jsonb_array_length(compliance_audit) > 0
        THEN compliance_audit->0
      ELSE '{}'::jsonb
    END
    WHERE jsonb_typeof(compliance_audit) = 'array'
  `);
}
