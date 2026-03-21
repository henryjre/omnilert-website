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

const { reconcileJobsSequentially } = await import('./epiSnapshotCron.service.js');

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
