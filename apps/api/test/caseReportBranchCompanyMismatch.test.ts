import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiSrcDir = path.resolve(testDir, '..', 'src');
const webSrcDir = path.resolve(testDir, '..', '..', 'web', 'src');

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
const caseReportServicePath = path.join(apiSrcDir, 'services', 'caseReport.service.ts');

test('case report create flow sends X-Company-Id from the selected branch company', () => {
  const modalSource = fs.readFileSync(createCaseModalPath, 'utf8');
  const apiSource = fs.readFileSync(caseReportApiPath, 'utf8');
  const createCaseApiBlock = apiSource.slice(
    apiSource.indexOf('export async function createCaseReport'),
    apiSource.indexOf('export async function updateCorrectiveAction'),
  );

  assert.match(
    modalSource,
    /companyId:\s*branchValue\?\.companyId\s*\?\?\s*null/,
    'CreateCaseModal should forward the selected companyId with the chosen branchId',
  );
  assert.match(
    createCaseApiBlock,
    /headers:\s*\{\s*['"]X-Company-Id['"]:\s*payload\.companyId\s*\}/,
    'createCaseReport should scope the request to the selected branch company',
  );
});

test('case report creation validates the branch against the scoped company before insert', () => {
  const source = fs.readFileSync(caseReportServicePath, 'utf8');
  const createCaseBlock = source.slice(
    source.indexOf('export async function createCaseReport'),
    source.indexOf('export async function updateCorrectiveAction'),
  );

  assert.match(
    source,
    /async function resolveAndValidateCaseBranchId\(/,
    'caseReport.service should define a branch validation helper for createCaseReport',
  );
  assert.match(
    source,
    /where\(\{\s*id:\s*branchId,\s*company_id:\s*companyId,\s*is_active:\s*true\s*\}\)/,
    'caseReport.service should verify the selected branch belongs to the scoped company and is active',
  );
  assert.match(
    createCaseBlock,
    /const branchId = await resolveAndValidateCaseBranchId\(\s*input\.companyId,\s*input\.userId,\s*input\.branchId\s*\)/,
    'createCaseReport should resolve the branch through the scoped-company validator before insert',
  );
  assert.match(
    createCaseBlock,
    /branch_id:\s*branchId/,
    'createCaseReport should insert the validated branchId instead of the raw request value',
  );
});
