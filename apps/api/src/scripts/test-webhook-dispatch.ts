import { db } from '../config/database.js';
import { calculateKpiScores } from '../services/epiCalculation.service.js';
import { getOdooEmployeeIdsByWebsiteKey } from '../services/odooQuery.service.js';
import { generateEpiReportPdf } from '../services/epiReport.service.js';
import { sendWeeklyEpiEmail } from '../services/mail.service.js';
import { logger } from '../utils/logger.js';

async function fetchUserKpiData(userId: string, userKey: string) {
  const dbConn = db.getDb();
  const odooEmployeeIds = await getOdooEmployeeIdsByWebsiteKey(userKey);
  
  const [cssAudits, peerEvaluations, complianceAuditRows, violationNotices] = await Promise.all([
    dbConn('store_audits')
      .where({ type: 'customer_service', status: 'completed' })
      .andWhere((ownedQuery: any) => {
        ownedQuery.where('audited_user_id', userId)
          .orWhere((canonicalKeyQuery: any) => {
            canonicalKeyQuery
              .whereNull('audited_user_id')
              .where('audited_user_key', userKey);
          });
      })
      .select(dbConn.raw(`css_star_rating as star_rating`), dbConn.raw(`completed_at::text as audited_at`)),
    dbConn('peer_evaluations')
      .where({ evaluated_user_id: userId })
      .whereNotNull('submitted_at')
      .select(
        dbConn.raw(`(q1_score + q2_score + q3_score) / 3.0 as average_score`),
        dbConn.raw(`submitted_at::text`),
        dbConn.raw(`wrs_effective_at::text`),
      ),
    dbConn('store_audits')
      .where({ type: 'service_crew_cctv', status: 'completed' })
      .andWhere((ownedQuery: any) => {
        ownedQuery.where('audited_user_id', userId)
          .orWhere((canonicalKeyQuery: any) => {
            canonicalKeyQuery
              .whereNull('audited_user_id')
              .where('audited_user_key', userKey);
          });

        if (odooEmployeeIds.length > 0) {
          ownedQuery.orWhere((legacyQuery: any) => {
            legacyQuery
              .whereNull('audited_user_id')
              .whereNull('audited_user_key')
              .whereIn('scc_odoo_employee_id', odooEmployeeIds);
          });
        }
      })
      .select(
        'scc_productivity_rate',
        'scc_uniform_compliance',
        'scc_hygiene_compliance',
        'scc_sop_compliance',
        'scc_customer_interaction',
        'scc_cashiering',
        'scc_suggestive_selling_and_upselling',
        'scc_service_efficiency',
        dbConn.raw(`completed_at::text as audited_at`),
      ),
    dbConn('violation_notices')
      .whereExists(
        dbConn('violation_notice_targets').whereRaw('violation_notice_id = violation_notices.id').where({ user_id: userId }),
      )
      .where({ status: 'completed' })
      .select('epi_decrease', dbConn.raw(`updated_at::text as completed_at`)),
  ]);

  const complianceAudit = complianceAuditRows.length
    ? complianceAuditRows.map((r: any) => ({
        answers: {
          scc_productivity_rate: r.scc_productivity_rate ?? false,
          scc_uniform_compliance: r.scc_uniform_compliance ?? false,
          scc_hygiene_compliance: r.scc_hygiene_compliance ?? false,
          scc_sop_compliance: r.scc_sop_compliance ?? false,
          scc_customer_interaction: r.scc_customer_interaction,
          scc_cashiering: r.scc_cashiering,
          scc_suggestive_selling_and_upselling: r.scc_suggestive_selling_and_upselling,
          scc_service_efficiency: r.scc_service_efficiency,
        },
        audited_at: r.audited_at,
      }))
    : null;

  return {
    userId,
    userKey,
    cssAudits: cssAudits.length ? cssAudits : null,
    peerEvaluations: peerEvaluations.length ? peerEvaluations : null,
    complianceAudit,
    violationNotices: violationNotices.length ? violationNotices : null,
  };
}

async function testLiveWebhook() {
  const masterDb = db.getDb();
  const snapshotDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  console.log('--- LIVE WEBHOOK TEST TRIGGER ---');

  // 1. Pick the first active service crew for testing
  const user = await masterDb('users as u')
    .where('u.id', '639316b3-bf5f-42a5-8059-800a17ddbd5b')
    .select('u.id', 'u.user_key', 'u.first_name', 'u.last_name', 'u.email', 'u.epi_score', 'u.employee_number')
    .first();

  if (!user) {
    console.error('No service crew found to test with.');
    process.exit(1);
  }

  console.log(`Found Test User: ${user.first_name} ${user.last_name} (${user.email})`);

  try {
    // 2. Fetch data & Calculate
    console.log('Calculating KPI metrics...');
    const kpiData = await fetchUserKpiData(user.id, user.user_key);
    const { breakdown, delta, raw_delta, capped } = await calculateKpiScores(kpiData as any, { minRecords: 0 });

    const epiBefore = Number(user.epi_score ?? 100);
    const epiAfter = Math.round((epiBefore + delta) * 10) / 10;

    const reportData = {
      userId: user.id,
      fullName: `${user.first_name} ${user.last_name}`.trim(),
      employeeNumber: user.employee_number ?? null,
      email: user.email as string,
      epiBefore,
      epiAfter,
      delta,
      rawDelta: raw_delta,
      capped,
      kpiBreakdown: breakdown,
      reportDate: snapshotDate,
    };

    // 3. Generate PDF
    console.log('Generating branded PDF report...');
    const pdfBuffer = await generateEpiReportPdf(reportData);

    // 4. Dispatch Webhook
    console.log('Dispatching webhook to n8n...');
    await sendWeeklyEpiEmail(
      user.email,
      reportData.fullName,
      reportData.epiBefore,
      reportData.epiAfter,
      reportData.delta,
      reportData.reportDate,
      pdfBuffer,
    );

    console.log('\n✅ TEST COMPLETED SUCCESSFULLY!');
    console.log(`Webhook Sent To: ${user.email}`);
    console.log(`EPI Shift: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
    console.log('Please check your n8n "Received Webhook" logs.');

  } catch (error: any) {
    console.error(`\n❌ TEST FAILED: ${error.message}`);
    logger.error(error);
  }

  process.exit(0);
}

testLiveWebhook().catch(err => {
  console.error(err);
  process.exit(1);
});
