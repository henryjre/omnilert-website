import type { Knex } from 'knex';
import { PERMISSIONS } from '@omnilert/shared';

const USERS_TABLE = 'users';
const BANK_VERIFICATIONS_TABLE = 'bank_information_verifications';
const BANK_PENDING_INDEX = 'bank_information_verifications_pending_user_unique';

function permissionLabelFromKey(key: string): string {
  return key
    .split('.')
    .pop()!
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function addColumnIfMissing(
  knex: Knex,
  table: string,
  column: string,
  alter: (tableBuilder: Knex.AlterTableBuilder) => void,
): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(table, column);
  if (!hasColumn) {
    await knex.schema.alterTable(table, alter);
  }
}

export async function up(knex: Knex): Promise<void> {
  await addColumnIfMissing(knex, USERS_TABLE, 'emergency_contact', (table) => {
    table.string('emergency_contact', 255).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'emergency_phone', (table) => {
    table.string('emergency_phone', 50).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'bank_account_number', (table) => {
    table.string('bank_account_number', 255).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'bank_id', (table) => {
    table.integer('bank_id').nullable();
  });

  if (!(await knex.schema.hasTable(BANK_VERIFICATIONS_TABLE))) {
    await knex.schema.createTable(BANK_VERIFICATIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable(USERS_TABLE).onDelete('CASCADE');
      table.integer('bank_id').notNullable();
      table.string('account_number', 255).notNullable();
      table.string('status', 20).notNullable().defaultTo('pending');
      table.uuid('reviewed_by').nullable().references('id').inTable(USERS_TABLE);
      table.timestamp('reviewed_at').nullable();
      table.text('rejection_reason').nullable();
      table.integer('odoo_partner_bank_id').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${BANK_PENDING_INDEX}
    ON ${BANK_VERIFICATIONS_TABLE} (user_id)
    WHERE status = 'pending'
  `);

  await knex('permissions')
    .insert({
      key: PERMISSIONS.BANK_INFORMATION_APPROVE,
      name: permissionLabelFromKey(PERMISSIONS.BANK_INFORMATION_APPROVE),
      description: `Permission: ${PERMISSIONS.BANK_INFORMATION_APPROVE}`,
      category: 'employee_verifications',
    })
    .onConflict('key')
    .merge({
      name: knex.raw('excluded.name'),
      description: knex.raw('excluded.description'),
      category: knex.raw('excluded.category'),
    });

  const [permission] = await knex('permissions')
    .where({ key: PERMISSIONS.BANK_INFORMATION_APPROVE })
    .select('id');
  if (!permission) return;

  const roles = await knex('roles')
    .whereIn('name', ['Administrator', 'Management'])
    .select('id');
  if (roles.length === 0) return;

  const rows = roles.map((role: { id: string }) => ({
    role_id: role.id,
    permission_id: permission.id as string,
  }));
  await knex('role_permissions')
    .insert(rows)
    .onConflict(['role_id', 'permission_id'])
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${BANK_PENDING_INDEX}`);

  if (await knex.schema.hasTable(BANK_VERIFICATIONS_TABLE)) {
    await knex.schema.dropTable(BANK_VERIFICATIONS_TABLE);
  }

  const permission = await knex('permissions')
    .where({ key: PERMISSIONS.BANK_INFORMATION_APPROVE })
    .first('id');
  if (permission) {
    await knex('role_permissions').where({ permission_id: permission.id }).delete();
    await knex('permissions').where({ id: permission.id }).delete();
  }

  if (await knex.schema.hasColumn(USERS_TABLE, 'bank_id')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('bank_id');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'bank_account_number')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('bank_account_number');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'emergency_phone')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('emergency_phone');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'emergency_contact')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('emergency_contact');
    });
  }
}

