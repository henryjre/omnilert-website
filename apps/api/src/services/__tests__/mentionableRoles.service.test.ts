import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

function readService(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function extractExportedFunction(source: string, functionName: string) {
  const start = source.indexOf(`export async function ${functionName}`);
  expect(start).toBeGreaterThanOrEqual(0);

  const returnTypeEnd = source.indexOf('}>', start);
  expect(returnTypeEnd).toBeGreaterThanOrEqual(0);

  const bodyStart = source.indexOf('{', returnTypeEnd + 2);
  expect(bodyStart).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not extract ${functionName}`);
}

test('mentionable roles are scoped to each feature view permission', () => {
  const cases = [
    {
      label: 'case reports',
      source: readService('../caseReport.service.ts'),
      permission: 'CASE_REPORT_VIEW',
    },
    {
      label: 'violation notices',
      source: readService('../violationNotice.service.ts'),
      permission: 'VIOLATION_NOTICE_VIEW',
    },
    {
      label: 'AIC variance',
      source: readService('../aicVariance.service.ts'),
      permission: 'AIC_VARIANCE_VIEW',
    },
  ];

  for (const { label, source, permission } of cases) {
    const getMentionablesBlock = extractExportedFunction(source, 'getMentionables');

    expect(
      getMentionablesBlock,
      `${label} mentionable roles should use the shared permission resolver`,
    ).toContain(`resolveRolesWithPermission(PERMISSIONS.${permission})`);
    expect(
      getMentionablesBlock,
      `${label} mentionable roles should not read all roles directly`,
    ).not.toMatch(/getDb\(\)\(['"]roles['"]\)/);
    expect(
      getMentionablesBlock,
      `${label} mentionable roles should not hard-code Service Crew exclusion`,
    ).not.toContain('SYSTEM_ROLES.SERVICE_CREW');
  }
});

test('AIC mentionables preserve resolved user display names', () => {
  const source = readService('../aicVariance.service.ts');
  const getMentionablesBlock = extractExportedFunction(source, 'getMentionables');

  expect(getMentionablesBlock).toContain('users,');
  expect(getMentionablesBlock).not.toContain('first_name');
  expect(getMentionablesBlock).not.toContain('last_name');
});
