import { db } from '../config/database.js';
import { getEmployeeWebsiteKeyByEmployeeId } from '../services/odoo.service.js';

type ServiceCrewCctvAuditRow = {
  id: string;
  scc_odoo_employee_id: number | null;
  audited_user_id: string | null;
  audited_user_key: string | null;
};

type BackfillStats = {
  scanned: number;
  updated: number;
  missingWebsiteKey: number;
  missingUserRecord: number;
  skippedNoEmployeeId: number;
};

function parseArgs(): { limit: number | null; dryRun: boolean } {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const raw = Number(arg.split('=')[1]);
      if (Number.isFinite(raw) && raw > 0) {
        limit = Math.floor(raw);
      }
    }
  }

  return { limit, dryRun };
}

async function listCandidateRows(limit: number | null): Promise<ServiceCrewCctvAuditRow[]> {
  const query = db.getDb()('store_audits')
    .where({ type: 'service_crew_cctv' })
    .whereNull('audited_user_id')
    .whereNotNull('scc_odoo_employee_id')
    .select('id', 'scc_odoo_employee_id', 'audited_user_id', 'audited_user_key')
    .orderBy('created_at', 'asc');

  if (limit !== null) {
    query.limit(limit);
  }

  return query as Promise<ServiceCrewCctvAuditRow[]>;
}

async function resolveUserByWebsiteKey(userKey: string): Promise<{ id: string } | null> {
  const rowByKey = await db.getDb()('users')
    .where({ user_key: userKey })
    .first('id');
  if (rowByKey && typeof rowByKey.id === 'string') {
    return { id: rowByKey.id };
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userKey);
  if (!isUuid) {
    return null;
  }

  const rowById = await db.getDb()('users')
    .where({ id: userKey })
    .first('id');
  if (!rowById || typeof rowById.id !== 'string') {
    return null;
  }
  return { id: rowById.id };
}

async function run(): Promise<void> {
  const { limit, dryRun } = parseArgs();
  const stats: BackfillStats = {
    scanned: 0,
    updated: 0,
    missingWebsiteKey: 0,
    missingUserRecord: 0,
    skippedNoEmployeeId: 0,
  };

  try {
    const rows = await listCandidateRows(limit);
    stats.scanned = rows.length;

    for (const row of rows) {
      const employeeId = Number(row.scc_odoo_employee_id);
      if (!Number.isFinite(employeeId) || employeeId <= 0) {
        stats.skippedNoEmployeeId += 1;
        continue;
      }

      const websiteKey = await getEmployeeWebsiteKeyByEmployeeId(employeeId);
      if (!websiteKey) {
        stats.missingWebsiteKey += 1;
        continue;
      }

      const user = await resolveUserByWebsiteKey(websiteKey);
      if (!user) {
        stats.missingUserRecord += 1;
      }

      if (dryRun) {
        stats.updated += 1;
        continue;
      }

      await db.getDb()('store_audits')
        .where({ id: row.id })
        .update({
          audited_user_id: user?.id ?? null,
          audited_user_key: websiteKey,
          updated_at: new Date(),
        });

      stats.updated += 1;
    }

    console.log('Service Crew CCTV audited-user backfill completed.');
    console.log(JSON.stringify({
      dryRun,
      limit,
      ...stats,
    }, null, 2));
  } finally {
    await db.getDb().destroy();
  }
}

run().catch((error) => {
  console.error('Service Crew CCTV audited-user backfill failed:', error);
  process.exitCode = 1;
});
