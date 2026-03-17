import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const MIGRATION_FILES = [
  'apps/api/src/migrations/master/011_case_report_permissions.ts',
  'apps/api/src/migrations/master/012_violation_notice_permissions.ts',
  'apps/api/src/migrations/master/014_peer_evaluation_permissions.ts',
];

test('deploy workflow rebuilds shared artifacts before running master migrations', async () => {
  const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');

  assert.match(workflow, /git clean -fdx/, 'deploy should remove ignored build artifacts');

  const sharedBuildIndex = workflow.indexOf('pnpm --filter @omnilert/shared build');
  const migrateIndex = workflow.indexOf('pnpm -C apps/api migrate:master');

  assert.notStrictEqual(sharedBuildIndex, -1, 'deploy should build @omnilert/shared');
  assert.notStrictEqual(migrateIndex, -1, 'deploy should run master migrations');
  assert.ok(sharedBuildIndex < migrateIndex, 'shared build must happen before master migrations');
});

test('master permission migrations are self-contained', async () => {
  for (const filePath of MIGRATION_FILES) {
    const source = await readFile(filePath, 'utf8');
    assert.doesNotMatch(
      source,
      /from '@omnilert\/shared'/,
      `${filePath} should not depend on @omnilert/shared at runtime`,
    );
  }
});
