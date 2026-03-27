import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= 'test-bootstrap-secret-1234567890';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-123456';
process.env.ODOO_DB ??= 'test-odoo-db';
process.env.ODOO_URL ??= 'http://localhost:8069';
process.env.ODOO_USERNAME ??= 'test-odoo-user@example.com';
process.env.ODOO_PASSWORD ??= 'test-odoo-password';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_ORGANIZATION_ID ??= 'test-openai-org';
process.env.OPENAI_PROJECT_ID ??= 'test-openai-project';

const {
  getWeeklyEligibilityCutoffDate,
  isEligibleForWeeklyEpiByAccountAge,
  reconcileJobsSequentially,
} = await import('./epiSnapshotCron.service.js');

test('weekly EPI eligibility includes account age exactly 30 days', () => {
  const referenceDate = new Date('2026-03-30T00:00:00.000Z');
  const exactlyThirtyDaysOld = new Date('2026-02-28T00:00:00.000Z');
  const twentyNineDaysOld = new Date('2026-03-01T00:00:00.001Z');

  assert.equal(isEligibleForWeeklyEpiByAccountAge(exactlyThirtyDaysOld, referenceDate), true);
  assert.equal(isEligibleForWeeklyEpiByAccountAge(twentyNineDaysOld, referenceDate), false);
});

test('weekly eligibility cutoff date is exactly 30 days before reference', () => {
  const referenceDate = new Date('2026-04-15T12:34:56.789Z');
  const cutoff = getWeeklyEligibilityCutoffDate(referenceDate);
  const expectedCutoff = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  assert.equal(cutoff.toISOString(), expectedCutoff.toISOString());
});

test('reconcileJobsSequentially waits for each job before starting the next one', async () => {
  const timeline: string[] = [];
  let activeJobs = 0;
  let overlapped = false;

  await reconcileJobsSequentially(
    [{ name: 'weekly' }, { name: 'monthly' }],
    async (job) => {
      if (activeJobs > 0) {
        overlapped = true;
      }

      activeJobs += 1;
      timeline.push(`start:${job.name}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
      timeline.push(`end:${job.name}`);
      activeJobs -= 1;
    },
  );

  assert.equal(overlapped, false);
  assert.deepEqual(timeline, [
    'start:weekly',
    'end:weekly',
    'start:monthly',
    'end:monthly',
  ]);
});
