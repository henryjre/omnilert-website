/**
 * Compatibility shim for tenants that previously recorded
 * `011_drop_employee_notifications_user_fk.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}

