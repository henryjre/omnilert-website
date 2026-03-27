import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PermissionRename = {
  fromKey: string;
  toKey: string;
  fromCategory: string;
  toCategory: string;
  toName?: string;
};

/**
 * Renames a permission key (and optionally its name/category).
 *
 * - If `fromKey` doesn't exist, we assume the migration already ran and just
 *   ensure category/name on `toKey` are correct.
 * - If both keys exist, we merge role_permissions from legacy → canonical,
 *   then delete the legacy row.
 * - Otherwise, we update the legacy row in-place.
 */
async function renamePermission(knex: Knex, input: PermissionRename): Promise<void> {
  const legacy = await knex('permissions').where({ key: input.fromKey }).first('id');

  if (!legacy) {
    // Already renamed in a prior run — just ensure category/name are correct.
    const update: Record<string, string> = { category: input.toCategory };
    if (input.toName) update.name = input.toName;
    await knex('permissions').where({ key: input.toKey }).update(update);
    return;
  }

  const canonical = await knex('permissions').where({ key: input.toKey }).first('id');

  if (canonical) {
    // Both keys exist — merge role_permissions from legacy into canonical.
    const rolePermissionRows = await knex('role_permissions')
      .where({ permission_id: legacy.id })
      .select('role_id');

    if (rolePermissionRows.length > 0) {
      await knex('role_permissions')
        .insert(
          rolePermissionRows.map((row) => ({
            role_id: row.role_id as string,
            permission_id: canonical.id as string,
          })),
        )
        .onConflict(['role_id', 'permission_id'])
        .ignore();
    }

    await knex('role_permissions').where({ permission_id: legacy.id }).delete();
    await knex('permissions').where({ id: legacy.id }).delete();

    const canonicalUpdate: Record<string, string> = { category: input.toCategory };
    if (input.toName) canonicalUpdate.name = input.toName;
    await knex('permissions').where({ id: canonical.id }).update(canonicalUpdate);
    return;
  }

  // Simple rename: update the legacy row in-place.
  const inPlaceUpdate: Record<string, string> = {
    key: input.toKey,
    category: input.toCategory,
  };
  if (input.toName) inPlaceUpdate.name = input.toName;
  await knex('permissions').where({ id: legacy.id }).update(inPlaceUpdate);
}

/**
 * Transfers all role_permissions from `fromKey` to `toKey`, then deletes
 * the `fromKey` permission row (FK cascade cleans up role_permissions).
 */
async function transferPermission(knex: Knex, fromKey: string, toKey: string): Promise<void> {
  const fromPerm = await knex('permissions').where({ key: fromKey }).first('id');
  if (!fromPerm) return; // Already removed in a prior run.

  const toPerm = await knex('permissions').where({ key: toKey }).first('id');
  if (!toPerm) throw new Error(`Target permission '${toKey}' not found`);

  const roleIds = await knex('role_permissions')
    .where({ permission_id: fromPerm.id })
    .pluck('role_id');

  if (roleIds.length > 0) {
    await knex('role_permissions')
      .insert(roleIds.map((role_id) => ({ role_id, permission_id: toPerm.id })))
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }

  await knex('permissions').where({ id: fromPerm.id }).delete();
}

// ---------------------------------------------------------------------------
// Stage 1 — Renames
// ---------------------------------------------------------------------------

const STAGE1_RENAMES: PermissionRename[] = [
  {
    fromKey: 'auth_request.approve_management',
    toKey: 'auth_request.manage_private',
    fromCategory: 'auth_request',
    toCategory: 'auth_request',
    toName: 'Manage Private Authorizations',
  },
  {
    fromKey: 'auth_request.approve_service_crew',
    toKey: 'auth_request.manage_public',
    fromCategory: 'auth_request',
    toCategory: 'auth_request',
    toName: 'Manage Public Authorizations',
  },
  {
    fromKey: 'employee_verification.view',
    toKey: 'employee_verification.view_page',
    fromCategory: 'employee_verifications',
    toCategory: 'employee_verifications',
    toName: 'View Page',
  },
  {
    fromKey: 'registration.approve',
    toKey: 'employee_verification.manage_registration',
    fromCategory: 'employee_verifications',
    toCategory: 'employee_verifications',
    toName: 'Manage Registration',
  },
  {
    fromKey: 'personal_information.approve',
    toKey: 'employee_verification.manage_personal',
    fromCategory: 'employee_verifications',
    toCategory: 'employee_verifications',
    toName: 'Manage Personal Information',
  },
  {
    fromKey: 'employee_requirements.approve',
    toKey: 'employee_verification.manage_requirements',
    fromCategory: 'employee_verifications',
    toCategory: 'employee_verifications',
    toName: 'Manage Employee Requirements',
  },
  {
    fromKey: 'bank_information.approve',
    toKey: 'employee_verification.manage_bank',
    fromCategory: 'employee_verifications',
    toCategory: 'employee_verifications',
    toName: 'Manage Bank Information',
  },
  {
    fromKey: 'store_audit.process',
    toKey: 'store_audit.manage',
    fromCategory: 'store_audit',
    toCategory: 'store_audit',
    toName: 'Manage Audits',
  },
  {
    fromKey: 'employee.view_all_profiles',
    toKey: 'employee_profiles.view',
    fromCategory: 'employee',
    toCategory: 'employee_profiles',
    toName: 'View Page',
  },
  {
    fromKey: 'employee.edit_work_profile',
    toKey: 'employee_profiles.manage_work',
    fromCategory: 'employee',
    toCategory: 'employee_profiles',
    toName: 'Manage Work Profile',
  },
  {
    fromKey: 'shift.view_all',
    toKey: 'schedule.view',
    fromCategory: 'shift',
    toCategory: 'schedule',
    toName: 'View Page',
  },
  {
    fromKey: 'shift.end_shift',
    toKey: 'schedule.end_shift',
    fromCategory: 'shift',
    toCategory: 'schedule',
    toName: 'End Shift',
  },
  {
    fromKey: 'peer_evaluation.view',
    toKey: 'workplace_relations.view',
    fromCategory: 'peer_evaluation',
    toCategory: 'workplace_relations',
    toName: 'View Page',
  },
  {
    fromKey: 'cash_request.view_all',
    toKey: 'cash_requests.view',
    fromCategory: 'cash_request',
    toCategory: 'cash_requests',
    toName: 'View Page',
  },
  {
    fromKey: 'cash_request.approve',
    toKey: 'cash_requests.manage',
    fromCategory: 'cash_request',
    toCategory: 'cash_requests',
    toName: 'Manage Requests',
  },
  {
    fromKey: 'account.submit_employee_requirements',
    toKey: 'account.manage_employee_requirements',
    fromCategory: 'account',
    toCategory: 'account',
    toName: 'Manage Employee Requirements',
  },
];

// ---------------------------------------------------------------------------
// Stage 2 — New permissions
// ---------------------------------------------------------------------------

const STAGE2_NEW_PERMISSIONS: Array<{ key: string; name: string; category: string }> = [
  { key: 'admin.manage_companies', name: 'Manage Companies', category: 'admin' },
  { key: 'admin.manage_departments', name: 'Manage Departments', category: 'admin' },
  { key: 'pos.view', name: 'View Point of Sale', category: 'pos' },
  { key: 'pos.manage_verifications', name: 'Manage POS Verifications', category: 'pos' },
  { key: 'pos.manage_audits', name: 'Audit POS Sessions', category: 'pos' },
  { key: 'account.manage_schedule', name: 'Manage Schedule', category: 'account' },
  { key: 'account.manage_auth_request', name: 'Manage Auth Requests', category: 'account' },
  { key: 'account.manage_cash_request', name: 'Manage Cash Requests', category: 'account' },
  { key: 'auth_request.view_page', name: 'View Authorization Requests', category: 'auth_request' },
  { key: 'auth_request.view_private', name: 'View Private Requests', category: 'auth_request' },
  { key: 'auth_request.view_public', name: 'View Public Requests', category: 'auth_request' },
];

// ---------------------------------------------------------------------------
// Stage 3 — Transfers
// ---------------------------------------------------------------------------

const STAGE3_TRANSFERS: Array<{ fromKey: string; toKey: string }> = [
  { fromKey: 'pos_verification.view', toKey: 'pos.view' },
  { fromKey: 'pos_session.view', toKey: 'pos.view' },
  { fromKey: 'pos_verification.confirm_reject', toKey: 'pos.manage_verifications' },
  { fromKey: 'pos_verification.upload_image', toKey: 'pos.manage_verifications' },
  { fromKey: 'pos_session.audit_complete', toKey: 'pos.manage_audits' },
  { fromKey: 'account.view_auth_requests', toKey: 'account.manage_auth_request' },
  { fromKey: 'account.submit_public_auth_request', toKey: 'account.manage_auth_request' },
  { fromKey: 'account.view_cash_requests', toKey: 'account.manage_cash_request' },
  { fromKey: 'account.submit_cash_request', toKey: 'account.manage_cash_request' },
  { fromKey: 'auth_request.view_all', toKey: 'auth_request.view_page' },
  { fromKey: 'shift.approve_authorizations', toKey: 'auth_request.manage_public' },
  { fromKey: 'case_report.create', toKey: 'case_report.manage' },
  { fromKey: 'case_report.close', toKey: 'case_report.manage' },
  { fromKey: 'violation_notice.request', toKey: 'violation_notice.manage' },
  { fromKey: 'violation_notice.create', toKey: 'violation_notice.manage' },
  { fromKey: 'violation_notice.confirm', toKey: 'violation_notice.manage' },
  { fromKey: 'violation_notice.reject', toKey: 'violation_notice.manage' },
  { fromKey: 'violation_notice.issue', toKey: 'violation_notice.manage' },
  { fromKey: 'violation_notice.complete', toKey: 'violation_notice.manage' },
];

const STAGE3_PURE_DELETES: string[] = [
  'admin.manage_branches',
  'dashboard.view_payslip',
  'dashboard.view_performance_index',
  'account.view_notifications',
  'employee.view_own_profile',
  'employee.edit_own_profile',
  'peer_evaluation.manage',
];

// ---------------------------------------------------------------------------
// Stage 4 — Descriptions
// ---------------------------------------------------------------------------

const STAGE4_DESCRIPTIONS: Record<string, string> = {
  'admin.manage_roles': 'Create, edit, and delete roles and their permissions',
  'admin.manage_users': 'Assign roles and manage user accounts',
  'admin.view_all_branches': 'View data across all branches regardless of assignment',
  'admin.manage_companies': 'Manage companies and branches across the platform',
  'admin.manage_departments': 'Create, edit, and delete departments',
  'pos.view': 'Access POS Verification and POS Session pages',
  'pos.manage_verifications': 'Confirm, reject, and upload images for POS verifications',
  'pos.manage_audits': 'Audit POS session entries and mark audits complete',
  'account.view_schedule': 'View own schedule under My Account',
  'account.manage_schedule':
    'Submit reasons for auth requests, end own shift, and request shift exchanges',
  'account.manage_auth_request': 'View and submit public authorization requests',
  'account.submit_private_auth_request':
    'Submit private (management-level) authorization requests',
  'account.manage_cash_request': 'View and submit personal cash requests',
  'account.manage_employee_requirements': 'View and submit employee requirement documents',
  'account.view_audit_results': 'View own audit results',
  'auth_request.view_page': 'Access the Authorization Requests page in the sidebar',
  'auth_request.view_private': 'View the management (private) section of Authorization Requests',
  'auth_request.view_public': 'View the service crew (public) section of Authorization Requests',
  'auth_request.manage_private': 'Approve and edit management authorization requests',
  'auth_request.manage_public': 'Approve and reject service crew authorization requests',
  'employee_verification.view_page': 'Access the Employee Verifications page',
  'employee_verification.manage_registration': 'Review and approve/reject registration submissions',
  'employee_verification.manage_personal':
    'Review and approve/reject personal information submissions',
  'employee_verification.manage_requirements':
    'Review and approve/reject employee requirement submissions',
  'employee_verification.manage_bank': 'Review and approve/reject bank information submissions',
  'case_report.view': 'Access the Case Reports page and view case data',
  'case_report.manage':
    'Create, close, and manage case reports, and request violation notices',
  'store_audit.view': 'Access the Store Audits page and view audit data',
  'store_audit.manage': 'Process store audits and request violation notices',
  'employee_profiles.view': 'Access the Employee Profiles page and view profile data',
  'employee_profiles.manage_work': 'Edit work information on employee profiles',
  'schedule.view': 'Access the Employee Schedule page and view schedule data',
  'schedule.end_shift': 'End shifts for all employees on the schedule',
  'violation_notice.view': 'Access the Violation Notices page and view notice data',
  'violation_notice.manage':
    'Create, confirm, reject, issue, and complete violation notices',
  'workplace_relations.view': 'Access the Workplace Relations page and view peer evaluations',
  'cash_requests.view': 'Access the Cash Requests management page',
  'cash_requests.manage': 'Approve, reject, and disburse cash requests',
};

// ===========================================================================
// UP
// ===========================================================================

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // -------------------------------------------------------------------------
    // Stage 1 — Renames
    // -------------------------------------------------------------------------
    for (const rename of STAGE1_RENAMES) {
      await renamePermission(trx, rename);
    }

    // -------------------------------------------------------------------------
    // Stage 2 — Insert new permissions
    // -------------------------------------------------------------------------
    const newPermissionRows = STAGE2_NEW_PERMISSIONS.map((p) => ({
      id: uuidv4(),
      key: p.key,
      name: p.name,
      category: p.category,
      description: null,
    }));

    await trx('permissions').insert(newPermissionRows).onConflict('key').ignore();

    // Auto-assign all new permissions to the Administrator role.
    const adminRole = await trx('roles').where({ name: 'Administrator' }).first('id');
    if (adminRole) {
      const newPermKeys = STAGE2_NEW_PERMISSIONS.map((p) => p.key);
      const insertedPerms = await trx('permissions')
        .whereIn('key', newPermKeys)
        .select('id');

      if (insertedPerms.length > 0) {
        await trx('role_permissions')
          .insert(
            insertedPerms.map((perm) => ({
              role_id: adminRole.id as string,
              permission_id: perm.id as string,
            })),
          )
          .onConflict(['role_id', 'permission_id'])
          .ignore();
      }
    }

    // -------------------------------------------------------------------------
    // Stage 3 — Delete & Transfer
    // -------------------------------------------------------------------------

    // Transfers
    for (const { fromKey, toKey } of STAGE3_TRANSFERS) {
      await transferPermission(trx, fromKey, toKey);
    }

    // Pure deletes (permissions that become public / no transfer needed)
    for (const key of STAGE3_PURE_DELETES) {
      await trx('permissions').where({ key }).delete();
    }

    // -------------------------------------------------------------------------
    // Stage 4 — Update descriptions
    // -------------------------------------------------------------------------
    for (const [key, description] of Object.entries(STAGE4_DESCRIPTIONS)) {
      await trx('permissions').where({ key }).update({ description });
    }
  });
}

// ===========================================================================
// DOWN
// ===========================================================================
//
// NOTE: Stage 3 (delete & transfer) is not fully reversible — the original
// role assignments for deleted permissions are lost. The down() migration
// re-inserts deleted permission rows (without role assignments) and reverses
// Stage 1 renames, but role_permissions for deleted permissions will be empty.
//
// Stage 4 descriptions are not reversed (descriptions are idempotent metadata).

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // -------------------------------------------------------------------------
    // Reverse Stage 3 — Re-insert deleted permissions (best-effort; no role
    // assignments restored since they were cascade-deleted).
    // -------------------------------------------------------------------------

    // Re-insert pure-deleted permissions.
    const pureDeleteRestores: Array<{ key: string; name: string; category: string }> = [
      { key: 'admin.manage_branches', name: 'Manage Branches', category: 'admin' },
      { key: 'dashboard.view_payslip', name: 'View Payslip', category: 'dashboard' },
      {
        key: 'dashboard.view_performance_index',
        name: 'View Performance Index',
        category: 'dashboard',
      },
      {
        key: 'account.view_notifications',
        name: 'View Notifications',
        category: 'account',
      },
      { key: 'employee.view_own_profile', name: 'View Own Profile', category: 'employee' },
      { key: 'employee.edit_own_profile', name: 'Edit Own Profile', category: 'employee' },
      { key: 'peer_evaluation.manage', name: 'Manage', category: 'peer_evaluation' },
    ];

    for (const perm of pureDeleteRestores) {
      await trx('permissions')
        .insert({ id: uuidv4(), ...perm, description: null })
        .onConflict('key')
        .ignore();
    }

    // Re-insert transfer-source permissions (the original keys that were deleted).
    const transferSourceRestores: Array<{ key: string; name: string; category: string }> = [
      { key: 'pos_verification.view', name: 'View', category: 'pos_verification' },
      { key: 'pos_session.view', name: 'View', category: 'pos_session' },
      {
        key: 'pos_verification.confirm_reject',
        name: 'Confirm Reject',
        category: 'pos_verification',
      },
      {
        key: 'pos_verification.upload_image',
        name: 'Upload Image',
        category: 'pos_verification',
      },
      { key: 'pos_session.audit_complete', name: 'Audit Complete', category: 'pos_session' },
      {
        key: 'account.view_auth_requests',
        name: 'View Auth Requests',
        category: 'account',
      },
      {
        key: 'account.submit_public_auth_request',
        name: 'Submit Public Auth Request',
        category: 'account',
      },
      {
        key: 'account.view_cash_requests',
        name: 'View Cash Requests',
        category: 'account',
      },
      {
        key: 'account.submit_cash_request',
        name: 'Submit Cash Request',
        category: 'account',
      },
      { key: 'auth_request.view_all', name: 'View All', category: 'auth_request' },
      {
        key: 'shift.approve_authorizations',
        name: 'Approve Authorizations',
        category: 'shift',
      },
      { key: 'case_report.create', name: 'Create', category: 'case_report' },
      { key: 'case_report.close', name: 'Close', category: 'case_report' },
      { key: 'violation_notice.request', name: 'Request', category: 'violation_notice' },
      { key: 'violation_notice.create', name: 'Create', category: 'violation_notice' },
      { key: 'violation_notice.confirm', name: 'Confirm', category: 'violation_notice' },
      { key: 'violation_notice.reject', name: 'Reject', category: 'violation_notice' },
      { key: 'violation_notice.issue', name: 'Issue', category: 'violation_notice' },
      { key: 'violation_notice.complete', name: 'Complete', category: 'violation_notice' },
    ];

    for (const perm of transferSourceRestores) {
      await trx('permissions')
        .insert({ id: uuidv4(), ...perm, description: null })
        .onConflict('key')
        .ignore();
    }

    // -------------------------------------------------------------------------
    // Reverse Stage 2 — Delete new permissions
    // -------------------------------------------------------------------------
    const newPermKeys = STAGE2_NEW_PERMISSIONS.map((p) => p.key);
    await trx('permissions').whereIn('key', newPermKeys).delete();

    // -------------------------------------------------------------------------
    // Reverse Stage 1 — Renames (inverse direction)
    // -------------------------------------------------------------------------
    for (const rename of STAGE1_RENAMES) {
      await renamePermission(trx, {
        fromKey: rename.toKey,
        toKey: rename.fromKey,
        fromCategory: rename.toCategory,
        toCategory: rename.fromCategory,
        // toName is omitted — original names are NOT restored by down()
      });
    }
  });
}
