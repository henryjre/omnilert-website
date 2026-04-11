import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webSrcDir = path.resolve(testDir, '..', 'src');

const createCaseModalPath = path.join(
  webSrcDir,
  'features',
  'case-reports',
  'components',
  'CreateCaseModal.tsx',
);
const caseReportApiPath = path.join(
  webSrcDir,
  'features',
  'case-reports',
  'services',
  'caseReport.api.ts',
);
const companyBranchPickerPath = path.join(webSrcDir, 'shared', 'components', 'CompanyBranchPicker.tsx');

test('case report API exposes the create-branches query for the create modal', () => {
  const source = fs.readFileSync(caseReportApiPath, 'utf8');

  assert.match(
    source,
    /export async function listCreateCaseReportBranches\(\)/,
    'caseReport.api should expose a helper for create-branch options',
  );
  assert.match(
    source,
    /api\.get\('\/case-reports\/create-branches'\)/,
    'caseReport.api should request the create-branches endpoint',
  );
});

test('CreateCaseModal loads case-report-specific branch groups and passes them to the picker', () => {
  const source = fs.readFileSync(createCaseModalPath, 'utf8');

  assert.match(
    source,
    /listCreateCaseReportBranches/,
    'CreateCaseModal should import the case-report-specific branch query',
  );
  assert.match(
    source,
    /const \[companyBranchGroups,\s*setCompanyBranchGroups\]/,
    'CreateCaseModal should keep its own companyBranchGroups state instead of relying on the global branch store',
  );
  assert.match(
    source,
    /await listCreateCaseReportBranches\(\)/,
    'CreateCaseModal should load case-report branch options when opened',
  );
  assert.match(
    source,
    /companyBranchGroups=\{companyBranchGroups\}/,
    'CreateCaseModal should pass the loaded branch groups into CompanyBranchPicker',
  );
});

test('CompanyBranchPicker accepts injected branch groups while preserving the store fallback', () => {
  const source = fs.readFileSync(companyBranchPickerPath, 'utf8');

  assert.match(
    source,
    /companyBranchGroups\?:\s*SelectorCompanyGroup\[];/,
    'CompanyBranchPicker should accept optional injected companyBranchGroups',
  );
  assert.match(
    source,
    /const storeCompanyBranchGroups = useBranchStore\(\(s\) => s\.companyBranchGroups\);/,
    'CompanyBranchPicker should keep reading the global branch store for existing callers',
  );
  assert.match(
    source,
    /const resolvedCompanyBranchGroups = companyBranchGroups \?\? storeCompanyBranchGroups;/,
    'CompanyBranchPicker should prefer injected branch groups and fall back to the store otherwise',
  );
});
