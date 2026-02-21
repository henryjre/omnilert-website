import type { Knex } from 'knex';
import { PERMISSIONS } from '@omnilert/shared';

const USERS_TABLE = 'users';
const PERSONAL_INFO_TABLE = 'personal_information_verifications';
const REQUIREMENT_TYPES_TABLE = 'employment_requirement_types';
const REQUIREMENT_SUBMISSIONS_TABLE = 'employment_requirement_submissions';

const PERSONAL_INFO_PENDING_INDEX = 'personal_information_verifications_pending_user_unique';
const REQUIREMENT_PENDING_INDEX = 'employment_requirement_submissions_pending_user_requirement_unique';

const LEGACY_REGISTRATION_VIEW = 'registration.view';

const REQUIREMENT_TYPES = [
  { code: 'psa_birth_certificate', label: 'Photocopy of PSA Birth Certificate', sort_order: 1 },
  { code: 'government_issued_id', label: 'Photocopy of Government-issued ID', sort_order: 2 },
  { code: 'xray_result_impression', label: 'Original Copy of X-ray Result Impression', sort_order: 3 },
  { code: 'urinalysis_result_impression', label: 'Original Copy of Urinalysis Result Impression', sort_order: 4 },
  { code: 'fecalysis_result_impression', label: 'Original Copy of Fecalysis Result Impression', sort_order: 5 },
  { code: 'employment_agreement_signed', label: 'Printed and Signed Employment Agreement', sort_order: 6 },
  { code: 'nbi_clearance', label: 'Original Copy of NBI Clearance', sort_order: 7 },
  { code: 'tin_id', label: 'Photocopy of TIN ID', sort_order: 8 },
  { code: 'sss_id', label: 'Photocopy of SSS ID', sort_order: 9 },
  { code: 'philhealth_id', label: 'Photocopy of PhilHealth ID', sort_order: 10 },
  { code: 'pagibig_membership_id', label: 'Photocopy of Pag-IBIG Membership ID', sort_order: 11 },
] as const;

function permissionLabelFromKey(key: string): string {
  return key
    .split('.')
    .pop()!
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function up(knex: Knex): Promise<void> {
  const hasValidIdUrl = await knex.schema.hasColumn(USERS_TABLE, 'valid_id_url');
  if (!hasValidIdUrl) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.string('valid_id_url', 500).nullable();
    });
  }

  const hasValidIdUpdatedAt = await knex.schema.hasColumn(USERS_TABLE, 'valid_id_updated_at');
  if (!hasValidIdUpdatedAt) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.timestamp('valid_id_updated_at').nullable();
    });
  }

  if (!(await knex.schema.hasTable(PERSONAL_INFO_TABLE))) {
    await knex.schema.createTable(PERSONAL_INFO_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('status', 20).notNullable().defaultTo('pending');
      table.jsonb('requested_changes').notNullable();
      table.jsonb('approved_changes').nullable();
      table.string('valid_id_url', 500).notNullable();
      table.uuid('reviewed_by').nullable().references('id').inTable('users');
      table.timestamp('reviewed_at').nullable();
      table.text('rejection_reason').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${PERSONAL_INFO_PENDING_INDEX}
    ON ${PERSONAL_INFO_TABLE} (user_id)
    WHERE status = 'pending'
  `);

  if (!(await knex.schema.hasTable(REQUIREMENT_TYPES_TABLE))) {
    await knex.schema.createTable(REQUIREMENT_TYPES_TABLE, (table) => {
      table.string('code', 100).primary();
      table.string('label', 255).notNullable();
      table.integer('sort_order').notNullable().defaultTo(0);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable(REQUIREMENT_SUBMISSIONS_TABLE))) {
    await knex.schema.createTable(REQUIREMENT_SUBMISSIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table
        .string('requirement_code', 100)
        .notNullable()
        .references('code')
        .inTable(REQUIREMENT_TYPES_TABLE)
        .onDelete('CASCADE');
      table.string('document_url', 500).notNullable();
      table.string('status', 20).notNullable().defaultTo('pending');
      table.uuid('reviewed_by').nullable().references('id').inTable('users');
      table.timestamp('reviewed_at').nullable();
      table.text('rejection_reason').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${REQUIREMENT_PENDING_INDEX}
    ON ${REQUIREMENT_SUBMISSIONS_TABLE} (user_id, requirement_code)
    WHERE status = 'pending'
  `);

  const requirementRows = REQUIREMENT_TYPES.map((item) => ({
    ...item,
    is_active: true,
    updated_at: knex.fn.now(),
  }));
  await knex(REQUIREMENT_TYPES_TABLE)
    .insert(requirementRows)
    .onConflict('code')
    .merge({ label: knex.raw('excluded.label'), sort_order: knex.raw('excluded.sort_order'), is_active: true, updated_at: knex.fn.now() });

  const permissionRows = [
    PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW,
    PERMISSIONS.REGISTRATION_APPROVE,
    PERMISSIONS.PERSONAL_INFORMATION_APPROVE,
    PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE,
  ].map((key) => ({
    key,
    name: permissionLabelFromKey(key),
    description: `Permission: ${key}`,
    category: 'employee_verifications',
  }));

  await knex('permissions').insert(permissionRows).onConflict('key').merge({
    name: knex.raw('excluded.name'),
    description: knex.raw('excluded.description'),
    category: knex.raw('excluded.category'),
  });

  const oldPermission = await knex('permissions').where({ key: LEGACY_REGISTRATION_VIEW }).first('id');
  const newViewPermission = await knex('permissions').where({ key: PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW }).first('id');
  if (oldPermission && newViewPermission) {
    const rolesWithOldView = await knex('role_permissions')
      .where({ permission_id: oldPermission.id })
      .select('role_id');
    const migratedRows = rolesWithOldView.map((row: { role_id: string }) => ({
      role_id: row.role_id,
      permission_id: newViewPermission.id,
    }));
    if (migratedRows.length > 0) {
      await knex('role_permissions').insert(migratedRows).onConflict(['role_id', 'permission_id']).ignore();
    }

    await knex('role_permissions').where({ permission_id: oldPermission.id }).delete();
    await knex('permissions').where({ id: oldPermission.id }).delete();
  }

  const adminManagementRoles = await knex('roles')
    .whereIn('name', ['Administrator', 'Management'])
    .select('id');
  const approverPermissionIds = await knex('permissions')
    .whereIn('key', [
      PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW,
      PERMISSIONS.REGISTRATION_APPROVE,
      PERMISSIONS.PERSONAL_INFORMATION_APPROVE,
      PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE,
    ])
    .select('id');

  const rolePermissionRows: Array<{ role_id: string; permission_id: string }> = [];
  for (const role of adminManagementRoles) {
    for (const permission of approverPermissionIds) {
      rolePermissionRows.push({
        role_id: role.id,
        permission_id: permission.id,
      });
    }
  }
  if (rolePermissionRows.length > 0) {
    await knex('role_permissions').insert(rolePermissionRows).onConflict(['role_id', 'permission_id']).ignore();
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${REQUIREMENT_PENDING_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${PERSONAL_INFO_PENDING_INDEX}`);

  if (await knex.schema.hasTable(REQUIREMENT_SUBMISSIONS_TABLE)) {
    await knex.schema.dropTable(REQUIREMENT_SUBMISSIONS_TABLE);
  }
  if (await knex.schema.hasTable(REQUIREMENT_TYPES_TABLE)) {
    await knex.schema.dropTable(REQUIREMENT_TYPES_TABLE);
  }
  if (await knex.schema.hasTable(PERSONAL_INFO_TABLE)) {
    await knex.schema.dropTable(PERSONAL_INFO_TABLE);
  }

  if (await knex.schema.hasColumn(USERS_TABLE, 'valid_id_updated_at')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('valid_id_updated_at');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'valid_id_url')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('valid_id_url');
    });
  }

  const newPermissionKeys = [
    PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW,
    PERMISSIONS.PERSONAL_INFORMATION_APPROVE,
    PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE,
  ];
  const newPermissionIds = await knex('permissions').whereIn('key', newPermissionKeys).select('id');
  if (newPermissionIds.length > 0) {
    await knex('role_permissions')
      .whereIn(
        'permission_id',
        newPermissionIds.map((item: { id: string }) => item.id),
      )
      .delete();
  }
  await knex('permissions').whereIn('key', newPermissionKeys).delete();
}
