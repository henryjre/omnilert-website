/**
 * Compatibility shim for tenants that previously recorded
 * `002_add_user_key_to_users.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}

