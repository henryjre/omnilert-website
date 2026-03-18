import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import { getActiveAttendances } from './odoo.service.js';
import { resolveCompanyByOdooBranchId } from './webhook.service.js';

let cronHandle: NodeJS.Timeout | null = null;
let cronAlignHandle: NodeJS.Timeout | null = null;
const DISABLED_AUDIT_ODOO_COMPANY_IDS = new Set<number>([2]);

function randomReward(): number {
  return Math.round((15 + Math.random() * 15) * 100) / 100;
}

function msUntilNextTopOfHour(now: Date = new Date()): number {
  const msIntoHour =
    (now.getMinutes() * 60 * 1000)
    + (now.getSeconds() * 1000)
    + now.getMilliseconds();
  if (msIntoHour === 0) return 0;
  return (60 * 60 * 1000) - msIntoHour;
}

export async function runComplianceCron(): Promise<void> {
  try {
    // hr.attendance field availability can vary across Odoo setups.
    // We currently rely on id, employee_id, company_id, and check_in from search_read.
    const attendances = await getActiveAttendances();
    const eligibleAttendances = attendances.filter(
      (attendance) => !DISABLED_AUDIT_ODOO_COMPANY_IDS.has(Number(attendance.company_id)),
    );
    if (eligibleAttendances.length === 0) return;

    const chosen = eligibleAttendances[Math.floor(Math.random() * eligibleAttendances.length)];
    if (!chosen) return;

    const company = await resolveCompanyByOdooBranchId(chosen.company_id);
    const tenantDb = await db.getTenantDb(company.db_name);

    const mappedBranch = await tenantDb('branches')
      .where({
        odoo_branch_id: String(chosen.company_id),
        is_active: true,
      })
      .first('id');

    const branch = mappedBranch ?? await tenantDb('branches')
      .where({ is_active: true })
      .orderBy([{ column: 'is_main_branch', order: 'desc' }, { column: 'created_at', order: 'asc' }])
      .first('id');

    if (!branch) return;

    if (!mappedBranch) {
      logger.warn(
        { companyId: company.id, odooBranchId: chosen.company_id },
        'Compliance cron could not map Odoo branch to tenant branch; using fallback branch',
      );
    }

    const [audit] = await tenantDb('store_audits')
      .insert({
        type: 'compliance',
        status: 'pending',
        branch_id: branch.id,
        monetary_reward: randomReward(),
        comp_odoo_employee_id: chosen.employee_id,
        comp_employee_name: chosen.employee_name,
        comp_employee_avatar: chosen.employee_avatar,
        comp_check_in_time: new Date(`${chosen.check_in.replace(' ', 'T')}Z`),
        comp_extra_fields: JSON.stringify(chosen.raw),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    try {
      getIO().of('/store-audits').to(`company:${company.id}`).emit('store-audit:new', audit);
    } catch {
      logger.warn('Socket.IO not available for compliance cron emit');
    }
  } catch (error) {
    logger.error({ err: error }, 'Compliance cron failed');
  }
}

export async function initComplianceCron(): Promise<void> {
  if (cronHandle || cronAlignHandle) return;

  const delayMs = msUntilNextTopOfHour();
  const firstRunAt = new Date(Date.now() + delayMs).toISOString();

  cronAlignHandle = setTimeout(() => {
    cronAlignHandle = null;
    void runComplianceCron();
    cronHandle = setInterval(() => {
      void runComplianceCron();
    }, 60 * 60 * 1000);
  }, delayMs);

  logger.info({ firstRunAt }, 'Compliance cron initialized (hourly at :00)');
}

export async function stopComplianceCron(): Promise<void> {
  if (cronAlignHandle) {
    clearTimeout(cronAlignHandle);
    cronAlignHandle = null;
  }
  if (!cronHandle) return;
  clearInterval(cronHandle);
  cronHandle = null;
}
