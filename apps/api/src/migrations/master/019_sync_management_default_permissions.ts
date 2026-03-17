import type { Knex } from 'knex';

const MANAGEMENT_ROLE = 'Management';

const MANAGEMENT_DEFAULT_PERMISSION_KEYS = [
  'admin.view_all_branches',
  'dashboard.view_payslip',
  'dashboard.view_performance_index',
  'pos_verification.view',
  'pos_session.view',
  'account.submit_cash_request',
  'account.submit_private_auth_request',
  'account.submit_public_auth_request',
  'account.view_auth_requests',
  'account.view_cash_requests',
  'account.view_notifications',
  'employee.edit_own_profile',
  'employee.view_all_profiles',
  'employee.view_own_profile',
  'shift.view_all',
  'auth_request.view_all',
  'cash_request.view_all',
  'employee_verification.view',
  'store_audit.process',
  'store_audit.view',
  'case_report.close',
  'case_report.create',
  'case_report.view',
  'violation_notice.view',
  'peer_evaluation.view',
] as const;

const PREVIOUS_MANAGEMENT_EXCLUSIONS = new Set<string>([
  'admin.manage_roles',
  'admin.manage_users',
  'case_report.manage',
  'account.submit_employee_requirements',
]);

async function syncRolePermissionsByKeys(
  knex: Knex,
  roleName: string,
  allowedKeys: readonly string[],
): Promise<void> {
  const role = await knex('roles')
    .where({ name: roleName })
    .first('id');
  if (!role) return;

  const permissionRows = await knex('permissions')
    .whereIn('key', [...allowedKeys])
    .select('id');

  await knex.transaction(async (trx) => {
    await trx('role_permissions')
      .where({ role_id: role.id })
      .delete();

    if (permissionRows.length > 0) {
      await trx('role_permissions')
        .insert(
          permissionRows.map((permission) => ({
            role_id: role.id,
            permission_id: permission.id,
          })),
        )
        .onConflict(['role_id', 'permission_id'])
        .ignore();
    }
  });
}

export async function up(knex: Knex): Promise<void> {
  await syncRolePermissionsByKeys(knex, MANAGEMENT_ROLE, MANAGEMENT_DEFAULT_PERMISSION_KEYS);
}

export async function down(knex: Knex): Promise<void> {
  const role = await knex('roles')
    .where({ name: MANAGEMENT_ROLE })
    .first('id');
  if (!role) return;

  const permissionRows = await knex('permissions')
    .whereNotIn('key', [...PREVIOUS_MANAGEMENT_EXCLUSIONS])
    .select('id');

  await knex.transaction(async (trx) => {
    await trx('role_permissions')
      .where({ role_id: role.id })
      .delete();

    if (permissionRows.length > 0) {
      await trx('role_permissions')
        .insert(
          permissionRows.map((permission) => ({
            role_id: role.id,
            permission_id: permission.id,
          })),
        )
        .onConflict(['role_id', 'permission_id'])
        .ignore();
    }
  });
}
