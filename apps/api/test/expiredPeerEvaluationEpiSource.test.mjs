import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('dashboard and snapshot EPI reads include expired peer evaluations', () => {
  const dashboardFile = new URL('../src/services/epiDashboard.service.ts', import.meta.url);
  const snapshotFile = new URL('../src/services/epiSnapshotCron.service.ts', import.meta.url);
  const dashboardSource = readFileSync(dashboardFile, 'utf8');
  const snapshotSource = readFileSync(snapshotFile, 'utf8');

  assert.match(
    dashboardSource,
    /where\(\{ evaluated_user_id: userId \}\)[\s\S]*whereNotNull\('submitted_at'\)[\s\S]*orWhere\('status', 'expired'\)/,
    'dashboard peer evaluation query should include expired rows',
  );
  assert.match(
    dashboardSource,
    /dbConn\.raw\(`expires_at::text`\)/,
    'dashboard peer evaluation query should select expires_at for expired evaluation timing',
  );

  assert.match(
    snapshotSource,
    /where\(\{ evaluated_user_id: userId \}\)[\s\S]*whereNotNull\('submitted_at'\)[\s\S]*orWhere\('status', 'expired'\)/,
    'snapshot peer evaluation query should include expired rows',
  );
  assert.match(
    snapshotSource,
    /dbConn\.raw\(`expires_at::text`\)/,
    'snapshot peer evaluation query should select expires_at for expired evaluation timing',
  );
});

test('employee analytics peer evaluation queries default expired rows to score 5 at expiry time', () => {
  const snapshotFile = new URL('../src/services/employeeAnalyticsSnapshot.service.ts', import.meta.url);
  const metricsFile = new URL('../src/services/employeeAnalyticsMetrics.service.ts', import.meta.url);
  const snapshotSource = readFileSync(snapshotFile, 'utf8');
  const metricsSource = readFileSync(metricsFile, 'utf8');

  assert.match(
    snapshotSource,
    /CASE[\s\S]*pe\.status = 'expired'[\s\S]*THEN 5\.0[\s\S]*AVG/s,
    'employee analytics snapshot should average expired peer evaluations as score 5',
  );
  assert.match(
    snapshotSource,
    /CASE[\s\S]*pe\.status = 'expired'[\s\S]*THEN pe\.expires_at[\s\S]*COALESCE\(pe\.wrs_effective_at, pe\.submitted_at\)/s,
    'employee analytics snapshot should use expires_at as the effective time for expired peer evaluations',
  );

  assert.match(
    metricsSource,
    /CASE[\s\S]*pe\.status = 'expired'[\s\S]*THEN pe\.expires_at[\s\S]*COALESCE\(pe\.wrs_effective_at, pe\.submitted_at\)/s,
    'employee analytics event query should use expires_at as the effective time for expired peer evaluations',
  );
  assert.match(
    metricsSource,
    /CASE[\s\S]*pe\.status = 'expired'[\s\S]*THEN 5(\.0)?[\s\S]*as score/s,
    'employee analytics event query should emit score 5 for expired peer evaluations',
  );
});
