/**
 * Compatibility shim for tenants that previously recorded
 * `004_add_registration_requests_and_employee_number.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}

