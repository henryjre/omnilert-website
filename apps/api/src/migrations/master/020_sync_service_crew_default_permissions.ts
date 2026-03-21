import type { Knex } from 'knex';

const SERVICE_CREW_ROLE = 'Service Crew';

const SERVICE_CREW_DEFAULT_PERMISSION_KEYS = [
  'dashboard.view_payslip',
  'dashboard.view_performance_index',
  'pos_verification.view',
  'pos_verification.confirm_reject',
  'pos_verification.upload_image',
  'pos_session.view',
  'account.view_schedule',
  'account.view_auth_requests',
  'account.submit_public_auth_request',
  'account.view_cash_requests',
  'account.submit_cash_request',
  'account.view_notifications',
  'account.view_audit_results',
  'employee.view_own_profile',
  'employee.edit_own_profile',
  'violation_notice.view',
  'violation_notice.create',
] as const;

const PREVIOUS_SERVICE_CREW_PERMISSION_KEYS = [
  ...SERVICE_CREW_DEFAULT_PERMISSION_KEYS,
  'dashboard.view',
  'account.submit_employee_requirements',
] as const;

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
  await syncRolePermissionsByKeys(knex, SERVICE_CREW_ROLE, SERVICE_CREW_DEFAULT_PERMISSION_KEYS);
}

export async function down(knex: Knex): Promise<void> {
  await syncRolePermissionsByKeys(knex, SERVICE_CREW_ROLE, PREVIOUS_SERVICE_CREW_PERMISSION_KEYS);
}
