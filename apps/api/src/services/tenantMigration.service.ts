import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Knex } from 'knex';
import { db } from '../config/database.js';

const tenantMigrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations/tenant',
);

const migrationConfig: Knex.MigratorConfig = {
  directory: tenantMigrationsDir,
  extension: 'ts',
  loadExtensions: ['.ts', '.js'],
};

export interface TenantMigrationStatus {
  currentVersion: string;
  completed: string[];
  pending: string[];
}

export async function migrateTenantDb(tenantDb: Knex) {
  return tenantDb.migrate.latest(migrationConfig);
}

export async function rollbackTenantDb(tenantDb: Knex, all = false) {
  return all
    ? tenantDb.migrate.rollback(migrationConfig, true)
    : tenantDb.migrate.rollback(migrationConfig);
}

export async function getTenantMigrationStatus(tenantDb: Knex): Promise<TenantMigrationStatus> {
  const [completed, pending] = await tenantDb.migrate.list(migrationConfig);
  const currentVersion = await tenantDb.migrate.currentVersion(migrationConfig);
  return {
    currentVersion,
    completed,
    pending,
  };
}

export async function updateCompanyMigrationState(
  companyId: string,
  dbName: string,
  migrationVersion: string,
): Promise<void> {
  const masterDb = db.getMasterDb();
  const now = new Date();

  await masterDb.transaction(async (trx) => {
    const updated = await trx('company_databases')
      .where({ company_id: companyId })
      .update({
        db_name: dbName,
        migration_version: migrationVersion,
        last_migrated_at: now,
      });

    if (updated === 0) {
      await trx('company_databases').insert({
        company_id: companyId,
        db_name: dbName,
        migration_version: migrationVersion,
        last_migrated_at: now,
      });
    }
  });
}
