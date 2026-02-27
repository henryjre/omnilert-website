/**
 * Compatibility shim for tenants that previously recorded
 * `013_drop_employee_shifts_user_fk.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}

