import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const tenantMigrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations/tenant',
);

const REQUIRED_COMPATIBILITY_SHIMS = [
  '014_drop_cash_requests_user_fks',
  '015_drop_authorization_requests_user_fks',
  '016_drop_more_global_user_fks',
  '017_store_audits',
  '018_case_reports',
  '019_case_messages_soft_delete',
  '020_violation_notices',
  '021_store_audits_vn_requested',
  '022_peer_evaluations',
  '023_add_vn_epi_decrease',
  '023_css_criteria_scores',
  '024_compliance_rename_criteria',
  '025_drop_push_subscriptions_user_fk',
  '026_store_audit_messages',
  '027_add_comp_ai_report',
] as const;

test('source tenant migrations include compatibility .js shims for legacy knex entries', () => {
  const missingShims = REQUIRED_COMPATIBILITY_SHIMS.filter((name) => (
    !fs.existsSync(path.join(tenantMigrationsDir, `${name}.js`))
  ));

  assert.deepEqual(
    missingShims,
    [],
    `Missing tenant migration compatibility shims: ${missingShims.join(', ')}`,
  );
});
