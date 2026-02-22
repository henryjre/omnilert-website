import type { Knex } from 'knex';

const USERS_TABLE = 'users';
const SHIFT_EXCHANGE_REQUESTS_TABLE = 'shift_exchange_requests';
const USERS_STATUS_CONSTRAINT = 'users_employment_status_check';
const SHIFT_EXCHANGE_STATUS_CONSTRAINT = 'shift_exchange_requests_status_check';
const SHIFT_EXCHANGE_STAGE_CONSTRAINT = 'shift_exchange_requests_approval_stage_check';
const SHIFT_EXCHANGE_PENDING_REQUESTER_IDX = 'shift_exchange_requests_pending_requester_shift_unique';
const SHIFT_EXCHANGE_PENDING_ACCEPTING_IDX = 'shift_exchange_requests_pending_accepting_shift_unique';

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
  if (await hasConstraint(knex, USERS_TABLE, USERS_STATUS_CONSTRAINT)) {
    await knex.raw(`ALTER TABLE ${USERS_TABLE} DROP CONSTRAINT ${USERS_STATUS_CONSTRAINT}`);
  }

  await knex.raw(`
    ALTER TABLE ${USERS_TABLE}
    ADD CONSTRAINT ${USERS_STATUS_CONSTRAINT}
    CHECK (employment_status IN ('active', 'resigned', 'inactive', 'suspended'))
  `);

  if (!(await knex.schema.hasTable(SHIFT_EXCHANGE_REQUESTS_TABLE))) {
    await knex.schema.createTable(SHIFT_EXCHANGE_REQUESTS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

      table.uuid('requester_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('accepting_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.uuid('requested_by').notNullable().references('id').inTable('users').onDelete('CASCADE');

      table.uuid('requester_company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('requester_company_db_name', 100).notNullable();
      table.uuid('requester_branch_id').notNullable();
      table.uuid('requester_shift_id').notNullable();
      table.integer('requester_shift_odoo_id').notNullable();

      table.uuid('accepting_company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.string('accepting_company_db_name', 100).notNullable();
      table.uuid('accepting_branch_id').notNullable();
      table.uuid('accepting_shift_id').notNullable();
      table.integer('accepting_shift_odoo_id').notNullable();

      table.string('status', 20).notNullable().defaultTo('pending');
      table.string('approval_stage', 30).notNullable().defaultTo('awaiting_employee');

      table.timestamp('employee_decision_at').nullable();
      table.text('employee_rejection_reason').nullable();

      table.uuid('hr_decision_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('hr_decision_at').nullable();
      table.text('hr_rejection_reason').nullable();

      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await hasConstraint(knex, SHIFT_EXCHANGE_REQUESTS_TABLE, SHIFT_EXCHANGE_STATUS_CONSTRAINT))) {
    await knex.raw(`
      ALTER TABLE ${SHIFT_EXCHANGE_REQUESTS_TABLE}
      ADD CONSTRAINT ${SHIFT_EXCHANGE_STATUS_CONSTRAINT}
      CHECK (status IN ('pending', 'approved', 'rejected'))
    `);
  }

  if (!(await hasConstraint(knex, SHIFT_EXCHANGE_REQUESTS_TABLE, SHIFT_EXCHANGE_STAGE_CONSTRAINT))) {
    await knex.raw(`
      ALTER TABLE ${SHIFT_EXCHANGE_REQUESTS_TABLE}
      ADD CONSTRAINT ${SHIFT_EXCHANGE_STAGE_CONSTRAINT}
      CHECK (approval_stage IN ('awaiting_employee', 'awaiting_hr', 'resolved'))
    `);
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${SHIFT_EXCHANGE_PENDING_REQUESTER_IDX}
    ON ${SHIFT_EXCHANGE_REQUESTS_TABLE} (requester_company_id, requester_shift_id)
    WHERE status = 'pending'
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${SHIFT_EXCHANGE_PENDING_ACCEPTING_IDX}
    ON ${SHIFT_EXCHANGE_REQUESTS_TABLE} (accepting_company_id, accepting_shift_id)
    WHERE status = 'pending'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${SHIFT_EXCHANGE_PENDING_REQUESTER_IDX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${SHIFT_EXCHANGE_PENDING_ACCEPTING_IDX}`);
  await knex.schema.dropTableIfExists(SHIFT_EXCHANGE_REQUESTS_TABLE);

  if (await hasConstraint(knex, USERS_TABLE, USERS_STATUS_CONSTRAINT)) {
    await knex.raw(`ALTER TABLE ${USERS_TABLE} DROP CONSTRAINT ${USERS_STATUS_CONSTRAINT}`);
  }

  await knex.raw(`
    ALTER TABLE ${USERS_TABLE}
    ADD CONSTRAINT ${USERS_STATUS_CONSTRAINT}
    CHECK (employment_status IN ('active', 'resigned', 'inactive'))
  `);
}
