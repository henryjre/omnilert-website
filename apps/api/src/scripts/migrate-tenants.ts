import '../config/env.js';
import { db } from '../config/database.js';
import {
  getTenantMigrationStatus,
  migrateTenantDb,
  updateCompanyMigrationState,
} from '../services/tenantMigration.service.js';

async function run() {
  const masterDb = db.getMasterDb();
  const companies = await masterDb('companies')
    .where({ is_active: true })
    .select('id', 'name', 'db_name');

  console.log(`Found ${companies.length} active tenant database(s).`);

  for (const company of companies) {
    console.log(`\nMigrating tenant: ${company.name} (${company.db_name})`);
    try {
      const tenantDb = await db.getTenantDb(company.db_name);
      const [batchNo, migrationFiles] = await migrateTenantDb(tenantDb);
      const status = await getTenantMigrationStatus(tenantDb);
      await updateCompanyMigrationState(
        company.id as string,
        company.db_name as string,
        status.currentVersion,
      );

      console.log(`  Batch: ${batchNo}`);
      if (migrationFiles.length > 0) {
        console.log(`  Applied: ${migrationFiles.join(', ')}`);
      } else {
        console.log('  Applied: none (already up to date)');
      }
      console.log(`  Current version: ${status.currentVersion}`);
    } catch (error) {
      console.error(`  ERROR: ${company.db_name}`, error);
    }
  }

  await db.destroyAll();
  console.log('\nTenant migration run complete.');
}

run().catch(async (error) => {
  console.error('Fatal tenant migration error:', error);
  await db.destroyAll();
  process.exit(1);
});
