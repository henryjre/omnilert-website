import type { Knex } from "knex";

const ROLE_MANAGEMENT = "Management";
const PERMISSION_KEY = "violation_notice.manage";

/**
 * Remove violation_notice.manage from the default Management role assignment.
 */
export async function up(knex: Knex): Promise<void> {
  const [roleRow, permissionRow] = await Promise.all([
    knex("roles").where({ name: ROLE_MANAGEMENT }).first("id"),
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
 * Restore violation_notice.manage assignment to Management role.
 */
export async function down(knex: Knex): Promise<void> {
  const [roleRow, permissionRow] = await Promise.all([
    knex("roles").where({ name: ROLE_MANAGEMENT }).first("id"),
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
