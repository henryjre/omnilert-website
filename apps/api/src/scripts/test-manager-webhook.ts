import { db } from '../config/database.js';
import { calculateKpiScores } from '../services/epiCalculation.service.js';
import { getOdooEmployeeIdsByWebsiteKey } from '../services/odooQuery.service.js';
import { generateManagerSummaryPdf } from '../services/epiReport.service.js';
import { sendManagerEpiSummaryEmail } from '../services/mail.service.js';

async function fetchUserKpiData(userId: string, userKey: string) {
  const dbConn = db.getDb();
  const odooEmployeeIds = await getOdooEmployeeIdsByWebsiteKey(userKey);
  const [cssAudits, peerEvaluations, complianceAuditRows, violationNotices] = await Promise.all([
    dbConn('store_audits').where({ type: 'customer_service', status: 'completed' }).andWhere((q: any) => {
        q.where('audited_user_id', userId).orWhere('audited_user_key', userKey);
    }).select(dbConn.raw(`css_star_rating as star_rating`), dbConn.raw(`completed_at::text as audited_at`)),
    dbConn('peer_evaluations').where({ evaluated_user_id: userId }).whereNotNull('submitted_at').select(
        dbConn.raw(`(q1_score + q2_score + q3_score) / 3.0 as average_score`), dbConn.raw(`submitted_at::text`), dbConn.raw(`wrs_effective_at::text`)
    ),
    dbConn('store_audits').where({ type: 'service_crew_cctv', status: 'completed' }).andWhere((q: any) => {
        q.where('audited_user_id', userId).orWhere('audited_user_key', userKey);
        if (odooEmployeeIds.length > 0) q.orWhereIn('scc_odoo_employee_id', odooEmployeeIds);
    }).select('scc_productivity_rate','scc_uniform_compliance','scc_hygiene_compliance','scc_sop_compliance','scc_customer_interaction','scc_cashiering','scc_suggestive_selling_and_upselling','scc_service_efficiency',dbConn.raw(`completed_at::text as audited_at`)),
    dbConn('violation_notices').whereExists(dbConn('violation_notice_targets').whereRaw('violation_notice_id = violation_notices.id').where({ user_id: userId })).where({ status: 'completed' }).select('epi_decrease', dbConn.raw(`updated_at::text as completed_at`)),
  ]);
  const complianceAudit = complianceAuditRows.map((r: any) => ({ answers: { scc_productivity_rate: r.scc_productivity_rate ?? false, scc_uniform_compliance: r.scc_uniform_compliance ?? false, scc_hygiene_compliance: r.scc_hygiene_compliance ?? false, scc_sop_compliance: r.scc_sop_compliance ?? false, scc_customer_interaction: r.scc_customer_interaction, scc_cashiering: r.scc_cashiering, scc_suggestive_selling_and_upselling: r.scc_suggestive_selling_and_upselling, scc_service_efficiency: r.scc_service_efficiency }, audited_at: r.audited_at }));
  return { userId, userKey, cssAudits: cssAudits.length ? cssAudits : null, peerEvaluations: peerEvaluations.length ? peerEvaluations : null, complianceAudit: complianceAudit.length ? complianceAudit : null, violationNotices: violationNotices.length ? violationNotices : null };
}

async function testManagerWebhook() {
  const masterDb = db.getDb();
  const snapshotDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // 1. Find a Manager to receive the test
  const manager = await masterDb('users as u').join('user_roles as ur', 'u.id', 'ur.user_id').join('roles as r', 'ur.role_id', 'r.id').where('u.is_active', true).whereIn('r.name', ['Administrator', 'Management']).select('u.id', 'u.first_name', 'u.last_name', 'u.email').first();
  if (!manager) { console.error('No management user found.'); process.exit(1); }

  // 2. Calculate for all service crew
  const crew = await masterDb('users as u').join('user_roles as ur', 'u.id', 'ur.user_id').join('roles as r', 'ur.role_id', 'r.id').where('u.is_active', true).where('u.employment_status', 'active').where('r.name', 'Service Crew').select('u.id', 'u.user_key', 'u.first_name', 'u.last_name', 'u.email', 'u.epi_score', 'u.employee_number').limit(50);
  
  console.log(`--- GLOBAL MANAGER WEBHOOK TEST ---`);
  console.log(`Calculating performance for ${crew.length} staff members...`);

  const reportDataList = [];
  for (const user of crew) {
    try {
      const kpiData = await fetchUserKpiData(user.id, user.user_key);
      const { breakdown, delta, raw_delta, capped } = await calculateKpiScores(kpiData as any, { minRecords: 0 });
      const epiBefore = Number(user.epi_score ?? 100);
      reportDataList.push({ userId: user.id, fullName: `${user.first_name} ${user.last_name}`.trim(), employeeNumber: user.employee_number ?? null, email: user.email as string, epiBefore, epiAfter: Math.round((epiBefore + delta) * 10) / 10, delta, rawDelta: raw_delta, capped, kpiBreakdown: breakdown, reportDate: snapshotDate });
    } catch (e) {}
  }

  const globalAvgDelta = reportDataList.reduce((s, r) => s + r.delta, 0) / reportDataList.length;

  // 3. Generate Global PDF
  console.log(`Generating Global Dashboard PDF for ${manager.first_name}...`);
  const summaryPdf = await generateManagerSummaryPdf(reportDataList, 'Omnilert Global', snapshotDate);

  // 4. Dispatch
  console.log(`Dispatching Global Summary to manager email: ${manager.email}...`);
  await sendManagerEpiSummaryEmail(manager.email, `${manager.first_name} ${manager.last_name}`, 'Omnilert Global', reportDataList.length, globalAvgDelta, snapshotDate, summaryPdf);

  console.log(`\n✅ GLOBAL MANAGER SUMMARY TEST COMPLETED!`);
  process.exit(0);
}

testManagerWebhook().catch(err => { console.error(err); process.exit(1); });
