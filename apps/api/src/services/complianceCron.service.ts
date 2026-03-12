import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import { getActiveAttendances } from './odoo.service.js';
import { resolveCompanyByOdooBranchId } from './webhook.service.js';

let cronHandle: NodeJS.Timeout | null = null;

function randomReward(): number {
  return Math.round((15 + Math.random() * 15) * 100) / 100;
}

export async function runComplianceCron(): Promise<void> {
  try {
    // hr.attendance field availability can vary across Odoo setups.
    // We currently rely on id, employee_id, company_id, and check_in from search_read.
    const attendances = await getActiveAttendances();
    if (attendances.length === 0) return;

    const chosen = attendances[Math.floor(Math.random() * attendances.length)];
    if (!chosen) return;

    const company = await resolveCompanyByOdooBranchId(chosen.company_id);
    const tenantDb = await db.getTenantDb(company.db_name);

    const branch = await tenantDb('branches')
      .where({ is_active: true })
      .orderBy([{ column: 'is_main_branch', order: 'desc' }, { column: 'created_at', order: 'asc' }])
      .first('id');
    if (!branch) return;

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
  if (cronHandle) return;
  cronHandle = setInterval(() => {
    void runComplianceCron();
  }, 60 * 60 * 1000);
  logger.info('Compliance cron initialized (hourly)');
}

export async function stopComplianceCron(): Promise<void> {
  if (!cronHandle) return;
  clearInterval(cronHandle);
  cronHandle = null;
}
