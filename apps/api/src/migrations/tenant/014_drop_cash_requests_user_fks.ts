import type { Knex } from 'knex';

const TABLE_NAME = 'cash_requests';
const USER_CONSTRAINT = 'cash_requests_user_id_foreign';
const REVIEWED_BY_CONSTRAINT = 'cash_requests_reviewed_by_foreign';
const DISBURSED_BY_CONSTRAINT = 'cash_requests_disbursed_by_foreign';

async function hasConstraint(knex: Knex, tableName: string, constraintName: string): Promise<boolean> {
  const result = await knex
    .select('con.conname')
    .from({ con: 'pg_constraint' })
    .join({ rel: 'pg_class' }, 'rel.oid', 'con.conrelid')
    .join({ nsp: 'pg_namespace' }, 'nsp.oid', 'rel.relnamespace')
    .whereRaw('rel.relname = ?', [tableName])
    .andWhereRaw('nsp.nspname = current_schema()')
    .andWhere('con.conname', constraintName)
    .first();

  return Boolean(result);
}

async function dropConstraintIfExists(knex: Knex, constraintName: string): Promise<void> {
  if (await hasConstraint(knex, TABLE_NAME, constraintName)) {
    await knex.raw(`
      ALTER TABLE ${TABLE_NAME}
      DROP CONSTRAINT ${constraintName}
    `);
  }
}

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) return;

  await dropConstraintIfExists(knex, USER_CONSTRAINT);
  await dropConstraintIfExists(knex, REVIEWED_BY_CONSTRAINT);
  await dropConstraintIfExists(knex, DISBURSED_BY_CONSTRAINT);
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) return;

  if (!(await hasConstraint(knex, TABLE_NAME, USER_CONSTRAINT))) {
    await knex.raw(`
      ALTER TABLE ${TABLE_NAME}
      ADD CONSTRAINT ${USER_CONSTRAINT}
      FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
    `);
  }

  if (!(await hasConstraint(knex, TABLE_NAME, REVIEWED_BY_CONSTRAINT))) {
    await knex.raw(`
      ALTER TABLE ${TABLE_NAME}
      ADD CONSTRAINT ${REVIEWED_BY_CONSTRAINT}
      FOREIGN KEY (reviewed_by)
      REFERENCES users(id)
    `);
  }

  const hasDisbursedBy = await knex.schema.hasColumn(TABLE_NAME, 'disbursed_by');
  if (hasDisbursedBy && !(await hasConstraint(knex, TABLE_NAME, DISBURSED_BY_CONSTRAINT))) {
    await knex.raw(`
      ALTER TABLE ${TABLE_NAME}
      ADD CONSTRAINT ${DISBURSED_BY_CONSTRAINT}
      FOREIGN KEY (disbursed_by)
      REFERENCES users(id)
    `);
  }
}

