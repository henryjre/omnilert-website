import type { Knex } from "knex";

const ROLE_ADMIN = "Administrator";
const PERMISSION_KEY = "account.manage_employee_requirements";

/**
 * Remove account.manage_employee_requirements from the default Administrator role assignment.
 */
export async function up(knex: Knex): Promise<void> {
  const [roleRow, permissionRow] = await Promise.all([
    knex("roles").where({ name: ROLE_ADMIN }).first("id"),
    knex("permissions").where({ key: PERMISSION_KEY }).first("id"),
  ]);

  if (!roleRow || !permissionRow) return;

  await knex("role_permissions")
    .where({
      role_id: String(roleRow.id),
      permission_id: String(permissionRow.id),
    })
    .delete();
}

/**
 * Restore account.manage_employee_requirements assignment to Administrator role.
 */
export async function down(knex: Knex): Promise<void> {
  const [roleRow, permissionRow] = await Promise.all([
    knex("roles").where({ name: ROLE_ADMIN }).first("id"),
    knex("permissions").where({ key: PERMISSION_KEY }).first("id"),
  ]);

  if (!roleRow || !permissionRow) return;

  await knex("role_permissions")
    .insert({
      role_id: String(roleRow.id),
      permission_id: String(permissionRow.id),
    })
    .onConflict(["role_id", "permission_id"])
    .ignore();
}
