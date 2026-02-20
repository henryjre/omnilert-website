import type { Knex } from 'knex';

/**
 * Baseline migration for tenant migration tracking.
 *
 * Existing tenants may already be at this schema level due to
 * inline provisioning and/or legacy one-off scripts.
 */
export async function up(_knex: Knex): Promise<void> {
  // No-op baseline.
}

export async function down(_knex: Knex): Promise<void> {
  // No-op baseline rollback.
}
