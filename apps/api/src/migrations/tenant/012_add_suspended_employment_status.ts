import type { Knex } from 'knex';

const USERS_TABLE = 'users';
const STATUS_CONSTRAINT = 'users_employment_status_check';

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

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(USERS_TABLE))) return;

  if (await hasConstraint(knex, USERS_TABLE, STATUS_CONSTRAINT)) {
    await knex.raw(`ALTER TABLE ${USERS_TABLE} DROP CONSTRAINT ${STATUS_CONSTRAINT}`);
  }

  await knex.raw(`
    ALTER TABLE ${USERS_TABLE}
    ADD CONSTRAINT ${STATUS_CONSTRAINT}
    CHECK (employment_status IN ('active', 'resigned', 'inactive', 'suspended'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(USERS_TABLE))) return;

  if (await hasConstraint(knex, USERS_TABLE, STATUS_CONSTRAINT)) {
    await knex.raw(`ALTER TABLE ${USERS_TABLE} DROP CONSTRAINT ${STATUS_CONSTRAINT}`);
  }

  await knex.raw(`
    ALTER TABLE ${USERS_TABLE}
    ADD CONSTRAINT ${STATUS_CONSTRAINT}
    CHECK (employment_status IN ('active', 'resigned', 'inactive'))
  `);
}
