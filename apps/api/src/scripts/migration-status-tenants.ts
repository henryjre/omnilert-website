import '../config/env.js';
import { db } from '../config/database.js';
import { getTenantMigrationStatus } from '../services/tenantMigration.service.js';

async function run() {
  const masterDb = db.getMasterDb();
  const companies = await masterDb('companies')
    .where({ is_active: true })
    .select('name', 'db_name');

  console.log(`Found ${companies.length} active tenant database(s).`);

  for (const company of companies) {
    console.log(`\nTenant: ${company.name} (${company.db_name})`);
    try {
      const tenantDb = await db.getTenantDb(company.db_name);
      const status = await getTenantMigrationStatus(tenantDb);
      console.log(`  Current version: ${status.currentVersion}`);
      console.log(`  Completed: ${status.completed.length}`);
      console.log(`  Pending: ${status.pending.length}`);
      if (status.pending.length > 0) {
        console.log(`  Pending files: ${status.pending.join(', ')}`);
      }
    } catch (error) {
      console.error(`  ERROR: ${company.db_name}`, error);
    }
  }

  await db.destroyAll();
}

run().catch(async (error) => {
  console.error('Fatal tenant migration status error:', error);
  await db.destroyAll();
  process.exit(1);
});
