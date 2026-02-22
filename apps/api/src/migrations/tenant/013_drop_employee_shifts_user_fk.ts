import type { Knex } from 'knex';

const TABLE_NAME = 'employee_shifts';
const CONSTRAINT_NAME = 'employee_shifts_user_id_foreign';

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
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) return;

  if (await hasConstraint(knex, TABLE_NAME, CONSTRAINT_NAME)) {
    await knex.raw(`
      ALTER TABLE ${TABLE_NAME}
      DROP CONSTRAINT ${CONSTRAINT_NAME}
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) return;

  if (!(await hasConstraint(knex, TABLE_NAME, CONSTRAINT_NAME))) {
    await knex.raw(`
      ALTER TABLE ${TABLE_NAME}
      ADD CONSTRAINT ${CONSTRAINT_NAME}
      FOREIGN KEY (user_id)
      REFERENCES users(id)
    `);
  }
}

