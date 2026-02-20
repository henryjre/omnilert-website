import '../config/env.js';
import { db } from '../config/database.js';
import {
  getTenantMigrationStatus,
  rollbackTenantDb,
  updateCompanyMigrationState,
} from '../services/tenantMigration.service.js';

function shouldRollbackAllBatches(): boolean {
  return process.argv.includes('--all');
}

async function run() {
  const rollbackAll = shouldRollbackAllBatches();
  const masterDb = db.getMasterDb();
  const companies = await masterDb('companies')
    .where({ is_active: true })
    .select('id', 'name', 'db_name');

  console.log(
    `Rolling back tenant migrations for ${companies.length} active tenant database(s).` +
    ` Mode: ${rollbackAll ? 'all batches' : 'single batch'}`,
  );

  for (const company of companies) {
    console.log(`\nRollback tenant: ${company.name} (${company.db_name})`);
    try {
      const tenantDb = await db.getTenantDb(company.db_name);
      const [batchNo, rolledBack] = await rollbackTenantDb(tenantDb, rollbackAll);
      const status = await getTenantMigrationStatus(tenantDb);
      await updateCompanyMigrationState(
        company.id as string,
        company.db_name as string,
        status.currentVersion,
      );

      console.log(`  Batch: ${batchNo}`);
      if (rolledBack.length > 0) {
        console.log(`  Rolled back: ${rolledBack.join(', ')}`);
      } else {
        console.log('  Rolled back: none');
      }
      console.log(`  Current version: ${status.currentVersion}`);
    } catch (error) {
      console.error(`  ERROR: ${company.db_name}`, error);
    }
  }

  await db.destroyAll();
  console.log('\nTenant rollback run complete.');
}

run().catch(async (error) => {
  console.error('Fatal tenant rollback error:', error);
  await db.destroyAll();
  process.exit(1);
});
