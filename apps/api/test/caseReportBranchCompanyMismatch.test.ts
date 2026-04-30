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
const caseReportControllerPath = path.join(apiSrcDir, 'controllers', 'caseReport.controller.ts');
const caseReportRoutesPath = path.join(apiSrcDir, 'routes', 'caseReport.routes.ts');
const apiClientPath = path.join(
  webSrcDir,
  'shared',
  'services',
  'api.client.ts',
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
    /companyId:\s*selectedBranch\?\.companyId\s*\?\?\s*null/,
    'CreateCaseModal should forward the selected companyId with the chosen branchId',
  );
  assert.match(
    createCaseApiBlock,
    /headers:\s*\{\s*['"]X-Company-Id['"]:\s*payload\.companyId\s*\}/,
    'createCaseReport should scope the request to the selected branch company',
  );
});

test('api client preserves explicit X-Company-Id headers for cross-company create flows', () => {
  const source = fs.readFileSync(apiClientPath, 'utf8');

  assert.match(
    source,
    /const explicitCompanyHeader =\s*config\.headers\?\.\['X-Company-Id'\] \?\? config\.headers\?\.\['x-company-id'\];/s,
    'api client should read any caller-provided company scope before applying branch defaults',
  );
  assert.match(
    source,
    /if \(!explicitCompanyHeader && selectedBranchIds\.length > 0 && branches\.length > 0\)/,
    'api client should only derive X-Company-Id from the branch selector when the request did not already provide one',
  );
});

test('case report list API accepts an explicit company scope for multi-company branch selections', () => {
  const source = fs.readFileSync(caseReportApiPath, 'utf8');
  const listBlock = source.slice(
    source.indexOf('export async function listCaseReports'),
    source.indexOf('export async function getCaseReport'),
  );

  assert.match(
    listBlock,
    /companyId\?:\s*string\s*\|\s*null/,
    'listCaseReports should accept an optional explicit company scope',
  );
  assert.match(
    listBlock,
    /headers:\s*\{\s*['"]X-Company-Id['"]:\s*companyId\s*\}/,
    'listCaseReports should pass explicit X-Company-Id headers when loading a selected company',
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
    /permissions:\s*string\[\];/,
    'createCaseReport should accept caller permissions so branch validation can distinguish managers from branch-assigned users',
  );
  assert.match(
    createCaseBlock,
    /const branchId = await resolveAndValidateCaseBranchId\(\s*input\.companyId,\s*input\.userId,\s*input\.permissions,\s*input\.branchId,?\s*\)/,
    'createCaseReport should pass caller permissions into the branch validator',
  );
  assert.match(
    source,
    /if\s*\(\s*effectiveAssignments\.length\s*>\s*0\s*&&\s*!hasManagePermission\(permissions\)\s*\)/,
    'branch assignment enforcement should be bypassed for users with CASE_REPORT_MANAGE',
  );
  assert.match(
    source,
    /user_company_access[\s\S]*where\(\{\s*user_id:\s*userId,\s*company_id:\s*companyId,\s*is_active:\s*true\s*\}\)/,
    'caseReport.service should still require active company access for the selected company',
  );
  assert.match(
    createCaseBlock,
    /branch_id:\s*branchId/,
    'createCaseReport should insert the validated branchId instead of the raw request value',
  );
});

test('case report create controller passes caller permissions to the service', () => {
  const source = fs.readFileSync(caseReportControllerPath, 'utf8');
  const createBlock = source.slice(
    source.indexOf('export async function create'),
    source.indexOf('export async function updateCorrectiveAction'),
  );

  assert.match(
    createBlock,
    /permissions:\s*req\.user!\.permissions/,
    'case report create controller should forward req.user.permissions into createCaseReport',
  );
});

test('case report routes expose a manage-guarded create-branches endpoint before :id routes', () => {
  const source = fs.readFileSync(caseReportRoutesPath, 'utf8');
  const controllerSource = fs.readFileSync(caseReportControllerPath, 'utf8');
  const createBranchesIndex = source.indexOf("router.get('/create-branches'");
  const getByIdIndex = source.indexOf("router.get('/:id'");

  assert.notEqual(createBranchesIndex, -1, 'case report routes should define a create-branches endpoint');
  assert.notEqual(getByIdIndex, -1, 'case report routes should define the existing :id endpoint');
  assert.ok(
    createBranchesIndex < getByIdIndex,
    'create-branches must be registered before /:id so Express does not treat it as a case id',
  );
  assert.match(
    source,
    /router\.get\(\s*'\/create-branches',\s*requirePermission\(PERMISSIONS\.CASE_REPORT_MANAGE\),\s*caseReportController\.listCreateBranches\s*\)/,
    'create-branches should require CASE_REPORT_MANAGE and map to the controller handler',
  );
  assert.match(
    controllerSource,
    /export async function listCreateBranches/,
    'caseReport controller should export a create-branches handler',
  );
});
