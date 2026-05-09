import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('AIC reference uniqueness', () => {
  test('webhook does not treat repeated references as duplicate records', () => {
    const source = readRepoFile('apps/api/src/services/aicVarianceWebhook.service.ts');

    expect(source).not.toMatch(/where\(\{\s*company_id:\s*companyId,\s*reference\s*\}\)\.first\('id'\)/);
    expect(source).not.toContain('record already exists, skipping');
  });

  test('migration removes company/reference uniqueness constraint', async () => {
    const migration = await import('../migrations/063_aic_reference_not_unique.js');
    const rawCalls: string[] = [];
    const knex = {
      raw: async (sql: string) => {
        rawCalls.push(sql);
      },
    };

    await migration.up(knex as any);

    expect(rawCalls).toEqual([
      'ALTER TABLE aic_records DROP CONSTRAINT IF EXISTS aic_records_company_reference_unique',
    ]);
  });
});
