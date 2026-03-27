import type { Knex } from 'knex';

type PermissionRename = {
  fromKey: string;
  toKey: string;
  fromCategory: string;
  toCategory: string;
};

const PERMISSION_RENAMES: PermissionRename[] = [
  {
    fromKey: 'shifts.view_all',
    toKey: 'shift.view_all',
    fromCategory: 'shifts',
    toCategory: 'shift',
  },
  {
    fromKey: 'shifts.approve_authorizations',
    toKey: 'shift.approve_authorizations',
    fromCategory: 'shifts',
    toCategory: 'shift',
  },
  {
    fromKey: 'shifts.end_shift',
    toKey: 'shift.end_shift',
    fromCategory: 'shifts',
    toCategory: 'shift',
  },
  {
    fromKey: 'auth_requests.approve_management',
    toKey: 'auth_request.approve_management',
    fromCategory: 'auth_requests',
    toCategory: 'auth_request',
  },
  {
    fromKey: 'auth_requests.view_all',
    toKey: 'auth_request.view_all',
    fromCategory: 'auth_requests',
    toCategory: 'auth_request',
  },
  {
    fromKey: 'auth_requests.approve_service_crew',
    toKey: 'auth_request.approve_service_crew',
    fromCategory: 'auth_requests',
    toCategory: 'auth_request',
  },
  {
    fromKey: 'cash_requests.view_all',
    toKey: 'cash_request.view_all',
    fromCategory: 'cash_requests',
    toCategory: 'cash_request',
  },
  {
    fromKey: 'cash_requests.approve',
    toKey: 'cash_request.approve',
    fromCategory: 'cash_requests',
    toCategory: 'cash_request',
  },
];

async function renamePermission(
  knex: Knex,
  input: PermissionRename,
): Promise<void> {
  const legacy = await knex('permissions').where({ key: input.fromKey }).first('id');
  if (!legacy) {
    await knex('permissions')
      .where({ key: input.toKey })
      .update({ category: input.toCategory });
    return;
  }

  const canonical = await knex('permissions').where({ key: input.toKey }).first('id');
  if (canonical) {
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
    await knex('permissions')
      .where({ id: canonical.id })
      .update({ category: input.toCategory });
    return;
  }

  await knex('permissions')
    .where({ id: legacy.id })
    .update({
      key: input.toKey,
      category: input.toCategory,
    });
}

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const rename of PERMISSION_RENAMES) {
      await renamePermission(trx, rename);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const rename of PERMISSION_RENAMES) {
      await renamePermission(trx, {
        fromKey: rename.toKey,
        toKey: rename.fromKey,
        fromCategory: rename.toCategory,
        toCategory: rename.fromCategory,
      });
    }
  });
}
