import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const singleDbMigrationPath = path.join(srcDir, 'migrations', '001_single_db_redesign.ts');
const migrationsDirPath = path.join(srcDir, 'migrations');
const accountControllerPath = path.join(srcDir, 'controllers', 'account.controller.ts');
const userControllerPath = path.join(srcDir, 'controllers', 'user.controller.ts');
const socketConfigPath = path.join(srcDir, 'config', 'socket.ts');
const employeeRequirementRoutesPath = path.join(srcDir, 'routes', 'employeeRequirement.routes.ts');
const authorizationRequestControllerPath = path.join(srcDir, 'controllers', 'authorizationRequest.controller.ts');
const employeeProfileServicePath = path.join(srcDir, 'services', 'employeeProfile.service.ts');
const globalUserManagementServicePath = path.join(srcDir, 'services', 'globalUserManagement.service.ts');
const registrationServicePath = path.join(srcDir, 'services', 'registration.service.ts');
const accountAuditResultServicePath = path.join(srcDir, 'services', 'accountAuditResult.service.ts');
const employeeRequirementServicePath = path.join(srcDir, 'services', 'employeeRequirement.service.ts');
const employeeVerificationServicePath = path.join(srcDir, 'services', 'employeeVerification.service.ts');
const assignedBranchServicePath = path.join(srcDir, 'services', 'assignedBranch.service.ts');
const caseReportServicePath = path.join(srcDir, 'services', 'caseReport.service.ts');
const aicVarianceControllerPath = path.join(srcDir, 'controllers', 'aicVariance.controller.ts');
const aicVarianceServicePath = path.join(srcDir, 'services', 'aicVariance.service.ts');
const aicVarianceWebhookServicePath = path.join(srcDir, 'services', 'aicVarianceWebhook.service.ts');
const aicReferenceNotUniqueMigrationPath = path.join(srcDir, 'migrations', '063_aic_reference_not_unique.ts');
const violationNoticeServicePath = path.join(srcDir, 'services', 'violationNotice.service.ts');
const webhookServicePath = path.join(srcDir, 'services', 'webhook.service.ts');
const dashboardControllerPath = path.join(srcDir, 'controllers', 'dashboard.controller.ts');
const posSessionControllerPath = path.join(srcDir, 'controllers', 'posSession.controller.ts');
const branchControllerPath = path.join(srcDir, 'controllers', 'branch.controller.ts');
const employeeShiftControllerPath = path.join(srcDir, 'controllers', 'employeeShift.controller.ts');
const shiftExchangeServicePath = path.join(srcDir, 'services', 'shiftExchange.service.ts');
const peerEvaluationQueueServicePath = path.join(srcDir, 'services', 'peerEvaluationQueue.service.ts');
const peerEvaluationServicePath = path.join(srcDir, 'services', 'peerEvaluation.service.ts');
const peerEvaluationControllerPath = path.join(srcDir, 'controllers', 'peerEvaluation.controller.ts');
const peerEvaluationCronServicePath = path.join(srcDir, 'services', 'peerEvaluationCron.service.ts');
const violationNoticeControllerPath = path.join(srcDir, 'controllers', 'violationNotice.controller.ts');
const violationNoticeRoutesPath = path.join(srcDir, 'routes', 'violationNotice.routes.ts');
const caseReportRoutesPath = path.join(srcDir, 'routes', 'caseReport.routes.ts');
const attendanceQueueServicePath = path.join(srcDir, 'services', 'attendanceQueue.service.ts');
const branchManagementPagePath = path.resolve(srcDir, '..', '..', 'web', 'src', 'features', 'company', 'pages', 'BranchManagementPage.tsx');
const roleManagementPagePath = path.resolve(srcDir, '..', '..', 'web', 'src', 'features', 'roles', 'pages', 'RoleManagementPage.tsx');
const requestVNModalPath = path.resolve(srcDir, '..', '..', 'web', 'src', 'features', 'violation-notices', 'components', 'RequestVNModal.tsx');
const caseReportDetailPanelPath = path.resolve(srcDir, '..', '..', 'web', 'src', 'features', 'case-reports', 'components', 'CaseReportDetailPanel.tsx');
const storeAuditsPagePath = path.resolve(srcDir, '..', '..', 'web', 'src', 'features', 'store-audits', 'pages', 'StoreAuditsPage.tsx');
const authorizationRequestsPagePath = path.resolve(srcDir, '..', '..', 'web', 'src', 'features', 'authorization-requests', 'pages', 'AuthorizationRequestsPage.tsx');
const sharedPermissionsConstantsPath = path.resolve(srcDir, '..', '..', '..', 'packages', 'shared', 'src', 'constants', 'permissions.ts');

test('account profile query uses single-db sensitive info join instead of removed users columns', () => {
  const source = fs.readFileSync(accountControllerPath, 'utf8');
  const getProfileBlock = source.slice(
    source.indexOf('export async function getProfile'),
    source.indexOf('export async function updateAccountEmail'),
  );

  assert.match(
    getProfileBlock,
    /leftJoin\('user_sensitive_info as usi', 'usi\.user_id', 'users\.id'\)/,
    'Expected account controller to join user_sensitive_info as usi',
  );
  assert.match(
    getProfileBlock,
    /leftJoin\('user_company_access as uca_profile'/,
    'Expected account controller to join user_company_access as uca_profile',
  );
  assert.doesNotMatch(
    getProfileBlock,
    /'users\.(legal_name|birthday|gender|address|sss_number|tin_number|pagibig_number|philhealth_number|marital_status|pin|valid_id_url|emergency_contact|emergency_phone|emergency_relationship|bank_account_number|bank_id|position_title|date_started)'/,
    'Account controller still selects removed sensitive/work columns from users table',
  );
});

test('branch summary queries resolve branch names from branches table', () => {
  const employeeProfileSource = fs.readFileSync(employeeProfileServicePath, 'utf8');
  const globalUserManagementSource = fs.readFileSync(globalUserManagementServicePath, 'utf8');

  assert.doesNotMatch(
    employeeProfileSource,
    /'ucb\.branch_name'/,
    'employeeProfile.service should not read ucb.branch_name directly',
  );
  assert.match(
    employeeProfileSource,
    /join\('branches as branches', 'ucb\.branch_id', 'branches\.id'\)/,
    'employeeProfile.service should join branches for branch names',
  );
  assert.match(
    employeeProfileSource,
    /'branches\.name as branch_name'/,
    'employeeProfile.service should select branches.name as branch_name',
  );

  assert.doesNotMatch(
    globalUserManagementSource,
    /'ucb\.branch_name'/,
    'globalUserManagement.service should not read ucb.branch_name directly',
  );
  assert.match(
    globalUserManagementSource,
    /join\('branches as branches', 'ucb\.branch_id', 'branches\.id'\)/,
    'globalUserManagement.service should join branches for branch names',
  );
  assert.match(
    globalUserManagementSource,
    /'branches\.name as branch_name'/,
    'globalUserManagement.service should select branches.name as branch_name',
  );
});

test('assigned branch service exposes is_main_branch on branch payloads', () => {
  const source = fs.readFileSync(assignedBranchServicePath, 'utf8');

  assert.match(
    source,
    /'b\.is_main_branch'/,
    'assignedBranch.service should select branches.is_main_branch',
  );
  assert.match(
    source,
    /is_main_branch:\s*Boolean\(row\.is_main_branch\)/,
    'assignedBranch.service should expose is_main_branch on each branch payload',
  );
});

test('dashboard check-in status exposes concrete branch identifiers', () => {
  const source = fs.readFileSync(dashboardControllerPath, 'utf8');

  assert.match(
    source,
    /branchId:\s*null,\s*branchOdooId:\s*null/s,
    'checked-out dashboard status should include null branch identifiers',
  );
  assert.match(
    source,
    /'b\.id as branch_id'/,
    'dashboard controller should select branch_id for check-in status',
  );
  assert.match(
    source,
    /'b\.odoo_branch_id as branch_odoo_id'/,
    'dashboard controller should select branch_odoo_id for check-in status',
  );
  assert.match(
    source,
    /branchId:\s*latestAttendanceEvent\.branchId \?\? null/,
    'dashboard controller should return branchId in check-in status',
  );
  assert.match(
    source,
    /branchOdooId:\s*latestAttendanceEvent\.branchOdooId \?\? null/,
    'dashboard controller should return branchOdooId in check-in status',
  );
});

test('account audit result queries use store_audits with company and branch joins', () => {
  const source = fs.readFileSync(accountAuditResultServicePath, 'utf8');

  assert.doesNotMatch(
    source,
    /global_store_audits/,
    'accountAuditResult.service should not reference removed global_store_audits relation',
  );
  assert.match(
    source,
    /db\.getDb\(\)\('store_audits as audits'\)/,
    'accountAuditResult.service should query store_audits as audits',
  );
  assert.match(
    source,
    /join\('companies as companies', 'audits\.company_id', 'companies\.id'\)/,
    'accountAuditResult.service should join companies for company_name and company_slug',
  );
  assert.match(
    source,
    /join\('branches as branches', 'audits\.branch_id', 'branches\.id'\)/,
    'accountAuditResult.service should join branches for branch_name',
  );
});

test('pos verifications schema allows register_cash_in and register_cash_out types', () => {
  const source = fs.readFileSync(singleDbMigrationPath, 'utf8');
  const posVerificationsBlock = source.slice(
    source.indexOf("await knex.schema.createTable('pos_verifications', (table) => {"),
    source.indexOf("await knex.schema.createTable('pos_verification_images', (table) => {"),
  );

  assert.match(
    posVerificationsBlock,
    /'register_cash_in'/,
    'pos_verifications verification_type check should allow register_cash_in',
  );
  assert.match(
    posVerificationsBlock,
    /'register_cash_out'/,
    'pos_verifications verification_type check should allow register_cash_out',
  );
  assert.match(
    posVerificationsBlock,
    /'refund_order'/,
    'pos_verifications verification_type check should allow refund_order',
  );
  assert.doesNotMatch(
    posVerificationsBlock,
    /'register_cash'(?=\s*[,\]])/,
    'pos_verifications verification_type check should not use legacy register_cash value',
  );
});

test('pos verifications schema allows awaiting_customer status for token pay flow', () => {
  const source = fs.readFileSync(singleDbMigrationPath, 'utf8');
  const posVerificationsBlock = source.slice(
    source.indexOf("await knex.schema.createTable('pos_verifications', (table) => {"),
    source.indexOf("await knex.schema.createTable('pos_verification_images', (table) => {"),
  );

  assert.match(
    posVerificationsBlock,
    /checkIn\(\['pending',\s*'awaiting_customer',\s*'confirmed',\s*'rejected'\]\)/,
    'pos_verifications status check should include awaiting_customer',
  );
});

test('valid ID field uses user_sensitive_info instead of users table', () => {
  const accountControllerSource = fs.readFileSync(accountControllerPath, 'utf8');
  const employeeRequirementSource = fs.readFileSync(employeeRequirementServicePath, 'utf8');

  assert.doesNotMatch(
    accountControllerSource,
    /masterDb\('users'\)\.where\(\{ id: userId \}\)\.select\('valid_id_url'\)\.first\(\)/,
    'account.controller should not select valid_id_url from users',
  );
  assert.doesNotMatch(
    accountControllerSource,
    /masterDb\('users'\)\s*\.where\(\{ id: userId \}\)\s*\.update\(\{\s*valid_id_url:/,
    'account.controller should not update valid_id_url on users',
  );
  assert.match(
    accountControllerSource,
    /masterDb\('user_sensitive_info'\)/,
    'account.controller should query user_sensitive_info for valid_id_url',
  );

  assert.doesNotMatch(
    employeeRequirementSource,
    /'users\.valid_id_url'/,
    'employeeRequirement.service should not select users.valid_id_url',
  );
  assert.match(
    employeeRequirementSource,
    /'usi\.valid_id_url'/,
    'employeeRequirement.service should select usi.valid_id_url',
  );
});

test('user me/profile sensitive fields use user_sensitive_info', () => {
  const source = fs.readFileSync(userControllerPath, 'utf8');

  assert.match(
    source,
    /leftJoin\('user_sensitive_info as usi', 'usi\.user_id', 'users\.id'\)/,
    'user.controller should join user_sensitive_info for sensitive fields',
  );
  assert.doesNotMatch(
    source,
    /'legal_name'|'birthday'|'gender'|'pin'|'valid_id_url'|'emergency_contact'|'emergency_phone'|'bank_id'|'bank_account_number'/,
    'user.controller should not select sensitive fields directly from users',
  );
  assert.doesNotMatch(
    source,
    /masterDb\('users'\)\s*\.where\(\{ id: userId \}\)\s*\.update\(\{\s*pin,/,
    'user.controller should not update pin directly on users',
  );
});

test('employee requirements namespace and route accept employee_requirements.approve', () => {
  const socketSource = fs.readFileSync(socketConfigPath, 'utf8');
  const routeSource = fs.readFileSync(employeeRequirementRoutesPath, 'utf8');

  const employeeRequirementsSocketBlock = socketSource.slice(
    socketSource.indexOf("const employeeRequirementsNs = io.of('/employee-requirements');"),
    socketSource.indexOf("employeeRequirementsNs.on('connection'"),
  );

  assert.match(
    employeeRequirementsSocketBlock,
    /PERMISSIONS\.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS/,
    'Socket guard for /employee-requirements should allow EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS',
  );
  assert.match(
    routeSource,
    /requireAnyPermission\([\s\S]*PERMISSIONS\.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS/,
    'Employee requirements route should use requireAnyPermission including EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS',
  );
});

test('branch controller create and mutating endpoints are scoped to company_id', () => {
  const source = fs.readFileSync(branchControllerPath, 'utf8');

  const createBlock = source.slice(
    source.indexOf('export async function create'),
    source.indexOf('export async function update'),
  );
  const updateBlock = source.slice(
    source.indexOf('export async function update'),
    source.indexOf('export async function remove'),
  );
  const removeBlock = source.slice(source.indexOf('export async function remove'));
  const listBlock = source.slice(
    source.indexOf('export async function list'),
    source.indexOf('export async function create'),
  );

  assert.match(
    createBlock,
    /company_id:\s*companyId/,
    'branch.controller create should write company_id from req.companyContext',
  );
  assert.match(
    listBlock,
    /where\('company_id',\s*companyId\)/,
    'branch.controller list should scope rows by company_id',
  );
  assert.match(
    updateBlock,
    /where\(\{\s*id,\s*company_id:\s*companyId\s*\}\)/,
    'branch.controller update should scope by id and company_id',
  );
  assert.match(
    removeBlock,
    /where\(\{\s*id,\s*company_id:\s*companyId\s*\}\)/,
    'branch.controller remove should scope by id and company_id',
  );
});

test('branch management create form shows Main Branch toggle outside edit-only block', () => {
  const source = fs.readFileSync(branchManagementPagePath, 'utf8');

  assert.match(
    source,
    /isMainBranch:\s*formData\.isMainBranch/,
    'Branch creation payload should include isMainBranch',
  );
  assert.doesNotMatch(
    source.match(/\{editingId && \(([\s\S]*?)\)\}/)?.[1] ?? '',
    /Main Branch/,
    'Main Branch toggle should not be inside the edit-only conditional block',
  );
});

test('user company branch snapshots do not write removed branch_name or branch_odoo_id columns', () => {
  const globalUserManagementSource = fs.readFileSync(globalUserManagementServicePath, 'utf8');
  const registrationSource = fs.readFileSync(registrationServicePath, 'utf8');

  const globalSnapshotBlock = globalUserManagementSource.slice(
    globalUserManagementSource.indexOf("await trx('user_company_branches').where({ user_id: input.userId }).delete();"),
    globalUserManagementSource.indexOf('});', globalUserManagementSource.indexOf("await trx('user_company_branches').where({ user_id: input.userId }).delete();")),
  );

  assert.match(
    globalSnapshotBlock,
    /await trx\('user_company_branches'\)\.insert/,
    'globalUserManagement should insert snapshot rows into user_company_branches',
  );
  assert.doesNotMatch(
    globalSnapshotBlock,
    /branch_name\s*:/,
    'globalUserManagement user_company_branches insert should not include removed branch_name',
  );
  assert.doesNotMatch(
    globalSnapshotBlock,
    /branch_odoo_id\s*:/,
    'globalUserManagement user_company_branches insert should not include removed branch_odoo_id',
  );

  const registrationSnapshotBlock = registrationSource.slice(
    registrationSource.indexOf("await trx('user_company_branches').where({ user_id: userId }).delete();"),
    registrationSource.indexOf('if (branchRows.length > 0) {', registrationSource.indexOf("await trx('user_company_branches').where({ user_id: userId }).delete();")) + 120,
  );

  assert.match(
    registrationSnapshotBlock,
    /await trx\('user_company_branches'\)\.insert\(branchRows\)/,
    'registration approval should insert snapshot rows into user_company_branches',
  );
  assert.doesNotMatch(
    registrationSnapshotBlock,
    /branch_name\s*:/,
    'registration user_company_branches insert should not include removed branch_name',
  );
  assert.doesNotMatch(
    registrationSnapshotBlock,
    /branch_odoo_id\s*:/,
    'registration user_company_branches insert should not include removed branch_odoo_id',
  );
});

test('global user bank autofill writes to user_sensitive_info instead of users', () => {
  const source = fs.readFileSync(globalUserManagementServicePath, 'utf8');

  const bankAutofillBlock = source.slice(
    source.indexOf('const existingBankInfo = await getEmployeeLinkedBankInfoByWebsiteUserKey'),
    source.indexOf("logger.warn(", source.indexOf('const existingBankInfo = await getEmployeeLinkedBankInfoByWebsiteUserKey')),
  );

  assert.doesNotMatch(
    bankAutofillBlock,
    /masterDb\('users'\)\s*\.where\(\{ id: created\.id \}\)\s*\.update\(\{\s*bank_id:/,
    'globalUserManagement should not update bank_id on users during auto-fill',
  );
  assert.match(
    bankAutofillBlock,
    /masterDb\('user_sensitive_info'\)/,
    'globalUserManagement should write bank autofill fields to user_sensitive_info',
  );
});

test('bank verification inserts and lookups are company-scoped in account controller', () => {
  const source = fs.readFileSync(accountControllerPath, 'utf8');

  const profileBankBlock = source.slice(
    source.indexOf("const bankVerification = await tenantDb('bank_information_verifications')"),
    source.indexOf('const workScope = await loadUserWorkScope', source.indexOf("const bankVerification = await tenantDb('bank_information_verifications')")),
  );

  assert.match(
    profileBankBlock,
    /where\(\{\s*company_id:\s*companyId,\s*user_id:\s*userId\s*\}\)/,
    'account profile should load bank verification rows scoped by company_id and user_id',
  );
  assert.match(
    profileBankBlock,
    /where\(\{\s*company_id:\s*companyId,\s*user_id:\s*userId,\s*status:\s*'approved'\s*\}\)/,
    'account profile should load latest approved bank verification scoped by company_id',
  );

  const submitBankBlock = source.slice(
    source.indexOf('export async function submitBankInformationVerification'),
    source.indexOf('export async function uploadValidId'),
  );

  assert.match(
    submitBankBlock,
    /where\(\{\s*company_id:\s*companyId,\s*user_id:\s*userId,\s*status:\s*'pending'\s*\}\)/,
    'submitBankInformationVerification should check pending records scoped by company_id',
  );
  assert.match(
    submitBankBlock,
    /where\(\{\s*company_id:\s*companyId,\s*user_id:\s*userId,\s*status:\s*'approved'\s*\}\)/,
    'submitBankInformationVerification should check approved cooldown scoped by company_id',
  );
  assert.match(
    submitBankBlock,
    /insert\(\{\s*company_id:\s*companyId,/,
    'submitBankInformationVerification should insert company_id',
  );
});

test('bank verification approval writes bank fields to user_sensitive_info and seed includes company_id', () => {
  const source = fs.readFileSync(employeeVerificationServicePath, 'utf8');

  const approveBankBlock = source.slice(
    source.indexOf('export async function approveBankInformationVerification'),
    source.indexOf('export async function rejectBankInformationVerification'),
  );

  assert.doesNotMatch(
    approveBankBlock,
    /masterDb\('users'\)\s*\.where\(\{ id: user\.id \}\)\s*\.update\(\{\s*bank_id:/,
    'approveBankInformationVerification should not update bank fields on users',
  );
  assert.match(
    approveBankBlock,
    /masterDb\('user_sensitive_info'\)/,
    'approveBankInformationVerification should write bank fields to user_sensitive_info',
  );
  assert.match(
    approveBankBlock,
    /where\(\{\s*id:\s*input\.verificationId,\s*company_id:\s*input\.companyId\s*\}\)/,
    'approveBankInformationVerification should scope verification lookup/update by company_id',
  );

  const seedBlock = source.slice(
    source.indexOf('export async function seedApprovedBankVerification'),
  );
  assert.match(
    seedBlock,
    /company_id:\s*companyId/,
    'seedApprovedBankVerification should insert company_id for each seeded row',
  );
});

test('account request inserts align with single-db schema (no created_by_name and include company_id)', () => {
  const source = fs.readFileSync(accountControllerPath, 'utf8');

  const createAuthorizationBlock = source.slice(
    source.indexOf('export async function createAuthorizationRequest'),
    source.indexOf('export async function getCashRequests'),
  );
  assert.match(
    createAuthorizationBlock,
    /insert\(\{\s*company_id:\s*companyId,/,
    'createAuthorizationRequest should insert company_id',
  );
  assert.doesNotMatch(
    createAuthorizationBlock,
    /created_by_name\s*:/,
    'createAuthorizationRequest should not insert removed created_by_name column',
  );

  const createCashBlock = source.slice(
    source.indexOf('export async function createCashRequest'),
    source.indexOf('export async function getNotificationCount'),
  );
  assert.match(
    createCashBlock,
    /insert\(\{\s*company_id:\s*companyId,/,
    'createCashRequest should insert company_id',
  );
  assert.doesNotMatch(
    createCashBlock,
    /created_by_name\s*:/,
    'createCashRequest should not insert removed created_by_name column',
  );
});

test('account verification submissions are company-scoped and insert company_id', () => {
  const source = fs.readFileSync(accountControllerPath, 'utf8');

  const profileBlock = source.slice(
    source.indexOf('export async function getProfile'),
    source.indexOf('export async function updateAccountEmail'),
  );
  assert.match(
    profileBlock,
    /tenantDb\('personal_information_verifications'\)\s*[\s\S]*?where\(\{\s*company_id:\s*companyId,\s*user_id:\s*userId\s*\}\)/,
    'getProfile should scope personal information verification lookup by company_id',
  );

  const personalSubmissionBlock = source.slice(
    source.indexOf('export async function submitPersonalInformationVerification'),
    source.indexOf('export async function submitBankInformationVerification'),
  );
  assert.match(
    personalSubmissionBlock,
    /where\(\{\s*company_id:\s*companyId,\s*user_id:\s*userId,\s*status:\s*'pending'\s*\}\)/,
    'submitPersonalInformationVerification should check pending rows scoped by company_id',
  );
  assert.match(
    personalSubmissionBlock,
    /insert\(\{\s*company_id:\s*companyId,/,
    'submitPersonalInformationVerification should insert company_id',
  );

  const employmentBlock = source.slice(
    source.indexOf('export async function submitEmploymentRequirement'),
    source.length,
  );
  assert.match(
    employmentBlock,
    /where\(\{\s*company_id:\s*companyId,\s*user_id:\s*userId,\s*requirement_code:\s*requirementCode,\s*status:\s*'pending'\s*\}\)/,
    'submitEmploymentRequirement should check pending rows scoped by company_id',
  );
  assert.match(
    employmentBlock,
    /insert\(\{\s*company_id:\s*companyId,/,
    'submitEmploymentRequirement should insert company_id',
  );

  const getRequirementsBlock = source.slice(
    source.indexOf('export async function getEmploymentRequirements'),
    source.indexOf('export async function submitEmploymentRequirement'),
  );
  assert.match(
    getRequirementsBlock,
    /FROM employment_requirement_submissions[\s\S]*WHERE user_id = \?\s+AND company_id = \?/,
    'getEmploymentRequirements should query submissions scoped by company_id',
  );
});

test('case report creation inserts company_id and global case_number', () => {
  const source = fs.readFileSync(caseReportServicePath, 'utf8');

  const createCaseBlock = source.slice(
    source.indexOf('export async function createCaseReport'),
    source.indexOf('export async function updateCorrectiveAction'),
  );

  assert.match(
    source,
    /async function getNextGlobalCaseNumber\(\s*trx:\s*Knex\.Transaction\s*\)/,
    'caseReport.service should define a transaction-scoped global case number allocator',
  );
  assert.match(
    createCaseBlock,
    /getNextGlobalCaseNumber\(\s*trx\s*\)/,
    'createCaseReport should allocate case_number from the global case report sequence',
  );
  assert.match(
    createCaseBlock,
    /insert\(\{\s*company_id:\s*input\.companyId,\s*case_number:\s*caseNumber,/,
    'createCaseReport should insert company_id and case_number',
  );
});

test('grouped users endpoint is company-context scoped and supports peer evaluation readers', () => {
  const controllerSource = fs.readFileSync(violationNoticeControllerPath, 'utf8');
  const groupedUsersBlock = controllerSource.slice(
    controllerSource.indexOf('export async function groupedUsers'),
    controllerSource.indexOf('export async function createFromCaseReport'),
  );

  assert.match(
    groupedUsersBlock,
    /const \{\s*companyId\s*\} = req\.companyContext!/,
    'groupedUsers controller should resolve companyId from req.companyContext',
  );
  assert.match(
    groupedUsersBlock,
    /companyId:\s*auditCompanyId\s*\?\?\s*companyId/,
    'groupedUsers controller should default to resolved company context when auditId is absent',
  );
  assert.doesNotMatch(
    groupedUsersBlock,
    /req\.user!\.companyId/,
    'groupedUsers controller should not use req.user.companyId directly',
  );

  const routesSource = fs.readFileSync(violationNoticeRoutesPath, 'utf8');
  assert.match(
    routesSource,
    /router\.get\(\s*'\/grouped-users',[\s\S]*requireAnyPermission\(/,
    'grouped-users route should use requireAnyPermission',
  );
  assert.match(
    routesSource,
    /PERMISSIONS\.WORKPLACE_RELATIONS_VIEW/,
    'grouped-users route should allow peer evaluation viewers',
  );
  assert.match(
    routesSource,
    /PERMISSIONS\.VIOLATION_NOTICE_MANAGE/,
    'grouped-users route should continue allowing violation notice creators',
  );
  assert.match(
    routesSource,
    /PERMISSIONS\.STORE_AUDIT_MANAGE/,
    'grouped-users route should allow store audit managers requesting VNs',
  );
});

test('AIC variance message endpoints authorize cross-company accessible records before mutating', () => {
  const controllerSource = fs.readFileSync(aicVarianceControllerPath, 'utf8');
  const serviceSource = fs.readFileSync(aicVarianceServicePath, 'utf8');
  const sendMessageBlock = serviceSource.slice(
    serviceSource.indexOf('export async function sendMessage(input: {'),
    serviceSource.indexOf('export async function editMessage(input: {'),
  );

  assert.match(
    serviceSource,
    /async function assertCanAccessAicRecord/,
    'AIC variance service should centralize record access checks for cross-company records',
  );
  assert.doesNotMatch(
    sendMessageBlock,
    /record\.company_id\s*!==\s*input\.companyId/,
    'AIC variance message sending should not reject records solely because they belong to another accessible company',
  );
  assert.match(
    sendMessageBlock,
    /emitAicEvent\('aic-variance:message', record\.company_id/,
    'AIC variance message sending should emit socket events to the record company',
  );
  assert.match(
    sendMessageBlock,
    /notifyReplyRecipient\(\{\s*companyId:\s*record\.company_id/s,
    'AIC variance reply notifications should use the record company',
  );
  assert.match(
    controllerSource,
    /const \{ sub: userId, roles = \[\], permissions = \[\], branchIds: userBranchIds = \[\] \} = req\.user!;/,
    'AIC variance message controller should pass the user access scope into the service',
  );
});

test('AIC variance references are descriptions, not duplicate keys', () => {
  const webhookSource = fs.readFileSync(aicVarianceWebhookServicePath, 'utf8');
  const migrationSource = fs.readFileSync(aicReferenceNotUniqueMigrationPath, 'utf8');

  assert.doesNotMatch(
    webhookSource,
    /where\(\{\s*company_id:\s*companyId,\s*reference\s*\}\)\.first\('id'\)/,
    'AIC webhook should not skip records solely because company_id + reference already exists',
  );
  assert.doesNotMatch(
    webhookSource,
    /record already exists, skipping/,
    'AIC webhook should not treat repeated references as duplicate AIC records',
  );
  assert.match(
    migrationSource,
    /DROP CONSTRAINT IF EXISTS aic_records_company_reference_unique/,
    'AIC reference migration should remove the company/reference uniqueness constraint',
  );
});

test('case report VN request flow uses request permission and case-report endpoint', () => {
  const modalSource = fs.readFileSync(requestVNModalPath, 'utf8');
  const violationNoticeRoutesSource = fs.readFileSync(violationNoticeRoutesPath, 'utf8');
  const caseReportRoutesSource = fs.readFileSync(caseReportRoutesPath, 'utf8');
  const storeAuditsSource = fs.readFileSync(storeAuditsPagePath, 'utf8');

  assert.match(
    modalSource,
    /requestViolationNotice\(\s*sourceCaseReportId,\s*\{/,
    'RequestVNModal should call case report request endpoint when sourceCaseReportId is set',
  );
  assert.doesNotMatch(
    modalSource,
    /createVNFromCaseReport\(/,
    'RequestVNModal should not call violation-notices/from-case-report for case sources',
  );

  const caseDetailSource = fs.readFileSync(caseReportDetailPanelPath, 'utf8');
  assert.match(
    caseDetailSource,
    /\{canRequestVN && !report\.vn_requested && !report\.linked_vn_id && \(/,
    'Case report Request VN button should be gated by canRequestVN to match backend authorization',
  );
  assert.match(
    storeAuditsSource,
    /const canRequestVN = hasAnyPermission\([\s\S]*PERMISSIONS\.STORE_AUDIT_MANAGE[\s\S]*PERMISSIONS\.VIOLATION_NOTICE_MANAGE[\s\S]*\)/,
    'Store audits Request VN action should allow STORE_AUDIT_MANAGE and VIOLATION_NOTICE_MANAGE users',
  );

  assert.match(
    caseReportRoutesSource,
    /request-vn',\s*requirePermission\(PERMISSIONS\.VIOLATION_NOTICE_MANAGE\)/,
    'case report request-vn route should require VIOLATION_NOTICE_MANAGE',
  );
  assert.match(
    violationNoticeRoutesSource,
    /\/from-case-report',[\s\S]*requirePermission\(PERMISSIONS\.VIOLATION_NOTICE_MANAGE\)/,
    'from-case-report route should require VIOLATION_NOTICE_MANAGE',
  );
  assert.match(
    violationNoticeRoutesSource,
    /\/from-store-audit',[\s\S]*requireAnyPermission\([\s\S]*PERMISSIONS\.STORE_AUDIT_MANAGE[\s\S]*PERMISSIONS\.VIOLATION_NOTICE_MANAGE[\s\S]*\)/,
    'from-store-audit route should allow STORE_AUDIT_MANAGE or VIOLATION_NOTICE_MANAGE',
  );
});

test('violation notice creation inserts company_id and sequence-backed vn_number', () => {
  const source = fs.readFileSync(violationNoticeServicePath, 'utf8');

  const createVnBlock = source.slice(
    source.indexOf('export async function createViolationNotice'),
    source.indexOf('export async function confirmViolationNotice'),
  );

  assert.match(
    createVnBlock,
    /getNextCompanySequence\(\s*trx,\s*input\.companyId,\s*'vn_number'\s*\)/,
    'createViolationNotice should allocate vn_number from company_sequences',
  );
  assert.match(
    createVnBlock,
    /insert\(\{\s*company_id:\s*input\.companyId,\s*vn_number:\s*vnNumber,/,
    'createViolationNotice should insert company_id and vn_number',
  );
});

test('violation notice completion does not write removed users.violation_notices column', () => {
  const source = fs.readFileSync(violationNoticeServicePath, 'utf8');

  const completionBlock = source.slice(
    source.indexOf('async function notifyViolationNoticeCompletionTargets'),
    source.indexOf('export async function sendMessage'),
  );

  assert.doesNotMatch(
    completionBlock,
    /COALESCE\(violation_notices,\s*'\[\]'::jsonb\)/,
    'violation notice completion should not append to removed users.violation_notices jsonb column',
  );
  assert.doesNotMatch(
    completionBlock,
    /violation_notices:\s*masterDb\.raw/,
    'violation notice completion should not attempt legacy users.violation_notices writes',
  );
  assert.match(
    completionBlock,
    /createAndDispatchNotification\(\{/,
    'violation notice completion should notify target users via employee_notifications flow',
  );
  assert.match(
    completionBlock,
    /createAutoApprovedEpiAdjustment/,
    'violation notice completion should apply EPI decreases through auto-approved EPI adjustment records',
  );
  assert.doesNotMatch(
    completionBlock,
    /epi_score:\s*epiAfter/,
    'violation notice completion should not directly update users.epi_score',
  );
});

test('attendance reassignment writes company_id when inserting user_branches rows', () => {
  const source = fs.readFileSync(webhookServicePath, 'utf8');
  const reassignBlock = source.slice(
    source.indexOf('export async function reassignUserToSingleCheckedInBranch'),
    source.indexOf('export interface AttendancePayload'),
  );

  assert.match(
    reassignBlock,
    /trx\('branches'\)\s*[\s\S]*?where\(\{\s*id:\s*branchId\s*\}\)\s*[\s\S]*?first\('company_id'\)/,
    'reassignUserToSingleCheckedInBranch should resolve company_id from branches',
  );
  assert.match(
    reassignBlock,
    /insert\(\{\s*company_id:\s*branch\.company_id,\s*user_id:\s*userId,\s*branch_id:\s*branchId,/,
    'reassignUserToSingleCheckedInBranch should insert company_id into user_branches',
  );
});

test('pos session verification queries use stable created_at ordering to prevent row shuffling after audit updates', () => {
  const source = fs.readFileSync(posSessionControllerPath, 'utf8');

  const listBlock = source.slice(
    source.indexOf('export async function list'),
    source.indexOf('export async function get'),
  );

  assert.match(
    listBlock,
    /whereIn\('pos_session_id',\s*sessionIds\)\s*[\s\S]*?orderBy\(\[\{\s*column:\s*'pos_session_id',\s*order:\s*'asc'\s*\},\s*\{\s*column:\s*'created_at',\s*order:\s*'asc'\s*\}\]\)/,
    'posSession list should order verifications by pos_session_id and created_at for stable grouping/order',
  );

  const getBlock = source.slice(
    source.indexOf('export async function get'),
    source.indexOf('export async function auditComplete'),
  );

  assert.match(
    getBlock,
    /where\('pos_session_id',\s*id as string\)\s*[\s\S]*?orderBy\('created_at',\s*'asc'\)/,
    'posSession get should order verifications by created_at to keep entry positions stable',
  );
});

test('permission namespace alignment migration exists for plural-to-singular key cleanup', () => {
  const migrationNames = fs.readdirSync(migrationsDirPath);
  const migrationName = migrationNames.find((name) => /006_.*permission.*alignment.*\.ts$/i.test(name));

  assert.ok(
    migrationName,
    'Expected a 006 permission alignment migration to rename shifts/auth_requests/cash_requests keys',
  );

  const source = fs.readFileSync(path.join(migrationsDirPath, migrationName!), 'utf8');
  assert.match(
    source,
    /shifts\.view_all[\s\S]*shift\.view_all/,
    'Permission alignment migration should remap shifts.view_all to shift.view_all',
  );
  assert.match(
    source,
    /auth_requests\.view_all[\s\S]*auth_request\.view_all/,
    'Permission alignment migration should remap auth_requests.view_all to auth_request.view_all',
  );
  assert.match(
    source,
    /cash_requests\.view_all[\s\S]*cash_request\.view_all/,
    'Permission alignment migration should remap cash_requests.view_all to cash_request.view_all',
  );
});

test('permission category keys use singular namespaces for role editor grouping', () => {
  const source = fs.readFileSync(sharedPermissionsConstantsPath, 'utf8');

  assert.match(
    source,
    /\n    shift:\s*\{\n/,
    'PERMISSION_CATEGORIES should expose shift category key',
  );
  assert.match(
    source,
    /\n    auth_request:\s*\{\n/,
    'PERMISSION_CATEGORIES should expose auth_request category key',
  );
  assert.match(
    source,
    /\n    cash_request:\s*\{\n/,
    'PERMISSION_CATEGORIES should expose cash_request category key',
  );
  assert.doesNotMatch(
    source,
    /\n    shifts:\s*\{/,
    'PERMISSION_CATEGORIES should not keep legacy shifts category key',
  );
  assert.doesNotMatch(
    source,
    /\n    auth_requests:\s*\{/,
    'PERMISSION_CATEGORIES should not keep legacy auth_requests category key',
  );
  assert.doesNotMatch(
    source,
    /\n    cash_requests:\s*\{/,
    'PERMISSION_CATEGORIES should not keep legacy cash_requests category key',
  );
});

test('role editor supports legacy plural permission categories during migration rollout', () => {
  const rolePageSource = fs.readFileSync(roleManagementPagePath, 'utf8');

  assert.match(
    rolePageSource,
    /CATEGORY_NORMALIZATION_ALIASES[\s\S]*shift:\s*'shift'[\s\S]*shifts:\s*'shift'/,
    'role editor should normalize singular and plural shift category keys',
  );
  assert.match(
    rolePageSource,
    /CATEGORY_NORMALIZATION_ALIASES[\s\S]*auth_request:\s*'auth_request'[\s\S]*auth_requests:\s*'auth_request'/,
    'role editor should normalize singular and plural auth request category keys',
  );
  assert.match(
    rolePageSource,
    /CATEGORY_NORMALIZATION_ALIASES[\s\S]*cash_request:\s*'cash_request'[\s\S]*cash_requests:\s*'cash_request'/,
    'role editor should normalize singular and plural cash request category keys',
  );
  assert.match(
    rolePageSource,
    /permissionBelongsToCategory\(permission,\s*key,\s*category\.permissions\)/,
    'role editor should filter permissions using key-aware category compatibility helper',
  );
});

test('shift log writes include company_id for end-shift and authorization resolution flows', () => {
  const employeeShiftSource = fs.readFileSync(employeeShiftControllerPath, 'utf8');
  const shiftAuthorizationSource = fs.readFileSync(path.join(srcDir, 'controllers', 'shiftAuthorization.controller.ts'), 'utf8');

  const endShiftBlock = employeeShiftSource.slice(
    employeeShiftSource.indexOf('export async function endShift'),
    employeeShiftSource.indexOf('// Enqueue peer evaluation check'),
  );
  assert.match(
    endShiftBlock,
    /const resolvedCompanyId = \(shift\.company_id as string \| null \| undefined\) \?\? companyId;/,
    'endShift should resolve company_id with company context fallback',
  );
  assert.match(
    endShiftBlock,
    /insert\(\{\s*company_id:\s*resolvedCompanyId,/,
    'endShift should include company_id when inserting shift_logs row',
  );

  const approveBlock = shiftAuthorizationSource.slice(
    shiftAuthorizationSource.indexOf('export async function approve'),
    shiftAuthorizationSource.indexOf('/** Manager rejects an authorization */'),
  );
  assert.match(
    approveBlock,
    /const resolvedCompanyId = \(auth\.company_id as string \| null \| undefined\) \?\? companyId;/,
    'shift authorization approve should resolve company_id with company context fallback',
  );
  assert.match(
    approveBlock,
    /insert\(\{\s*company_id:\s*resolvedCompanyId,/,
    'shift authorization approve should include company_id when inserting shift_logs row',
  );

  const rejectBlock = shiftAuthorizationSource.slice(
    shiftAuthorizationSource.indexOf('export async function reject'),
    shiftAuthorizationSource.indexOf('function authTypeLabel'),
  );
  assert.match(
    rejectBlock,
    /const resolvedCompanyId = \(auth\.company_id as string \| null \| undefined\) \?\? companyId;/,
    'shift authorization reject should resolve company_id with company context fallback',
  );
  assert.match(
    rejectBlock,
    /insert\(\{\s*company_id:\s*resolvedCompanyId,/,
    'shift authorization reject should include company_id when inserting shift_logs row',
  );
});

test('shift list and schedule endpoints expose user avatar fields with users join', () => {
  const employeeShiftSource = fs.readFileSync(employeeShiftControllerPath, 'utf8');
  const accountSource = fs.readFileSync(accountControllerPath, 'utf8');

  const employeeShiftListBlock = employeeShiftSource.slice(
    employeeShiftSource.indexOf('export async function list'),
    employeeShiftSource.indexOf('export async function get'),
  );
  assert.match(
    employeeShiftListBlock,
    /leftJoin\('users', 'employee_shifts\.user_id', 'users\.id'\)/,
    'employee shift list should join users to resolve avatar_url',
  );
  assert.match(
    employeeShiftListBlock,
    /'users\.avatar_url as user_avatar_url'/,
    'employee shift list should select users.avatar_url as user_avatar_url',
  );

  const employeeShiftGetBlock = employeeShiftSource.slice(
    employeeShiftSource.indexOf('export async function get'),
    employeeShiftSource.indexOf('export async function endShift'),
  );
  assert.match(
    employeeShiftGetBlock,
    /leftJoin\('users', 'employee_shifts\.user_id', 'users\.id'\)/,
    'employee shift detail should join users to resolve avatar_url',
  );
  assert.match(
    employeeShiftGetBlock,
    /'users\.avatar_url as user_avatar_url'/,
    'employee shift detail should select users.avatar_url as user_avatar_url',
  );

  const accountScheduleBlock = accountSource.slice(
    accountSource.indexOf('export async function getSchedule'),
    accountSource.indexOf('export async function getScheduleBranches'),
  );
  assert.match(
    accountScheduleBlock,
    /leftJoin\('users', 'employee_shifts\.user_id', 'users\.id'\)/,
    'account schedule list should join users to resolve avatar_url',
  );
  assert.match(
    accountScheduleBlock,
    /'users\.avatar_url as user_avatar_url'/,
    'account schedule list should select users.avatar_url as user_avatar_url',
  );

  const accountScheduleShiftBlock = accountSource.slice(
    accountSource.indexOf('export async function getScheduleShift'),
    accountSource.indexOf('export async function getAuthorizationRequests'),
  );
  assert.match(
    accountScheduleShiftBlock,
    /leftJoin\('users', 'employee_shifts\.user_id', 'users\.id'\)/,
    'account schedule detail should join users to resolve avatar_url',
  );
  assert.match(
    accountScheduleShiftBlock,
    /'users\.avatar_url as user_avatar_url'/,
    'account schedule detail should select users.avatar_url as user_avatar_url',
  );
});

test('shift exchange lifecycle appends activity logs per shift with shift_exchange metadata', () => {
  const source = fs.readFileSync(shiftExchangeServicePath, 'utf8');

  assert.match(
    source,
    /insert\(\{\s*company_id:\s*input\.companyId,[\s\S]*shift_id:\s*input\.shiftId,[\s\S]*branch_id:\s*input\.branchId,[\s\S]*log_type:\s*'authorization_resolved'/,
    'shift exchange activity log insert should include company_id, shift_id, branch_id, and authorization_resolved log type',
  );
  assert.match(
    source,
    /auth_type:\s*SHIFT_EXCHANGE_AUTH_TYPE/,
    'shift exchange logs should identify auth_type as shift_exchange metadata',
  );
  assert.match(
    source,
    /shift_exchange_side:\s*input\.exchangeSide/,
    'shift exchange logs should include requester/accepting side metadata for UI actions',
  );
  assert.match(
    source,
    /emit\('shift:log-new', log\)/,
    'shift exchange activity logs should emit shift:log-new realtime events',
  );
  assert.match(
    source,
    /resolution:\s*'requested'/,
    'shift exchange creation should log requested resolution',
  );
  assert.match(
    source,
    /resolution:\s*'awaiting_hr'/,
    'shift exchange employee acceptance should log awaiting_hr resolution',
  );
  assert.match(
    source,
    /resolution:\s*'approved'/,
    'shift exchange final approval should log approved resolution',
  );
  assert.match(
    source,
    /resolution:\s*'rejected'/,
    'shift exchange rejection paths should log rejected resolution',
  );
});

test('planning slot delete clears linked shift exchange requests before deleting shift rows', () => {
  const source = fs.readFileSync(webhookServicePath, 'utf8');
  const deleteBlock = source.slice(
    source.indexOf('export async function processPlanningSlotDelete'),
    source.indexOf('return {', source.indexOf('export async function processPlanningSlotDelete')),
  );

  assert.match(
    deleteBlock,
    /trx\('shift_exchange_requests'\)[\s\S]*where\('requester_shift_id', existing\.id\)[\s\S]*orWhere\('accepting_shift_id', existing\.id\)[\s\S]*delete\(\)/,
    'processPlanningSlotDelete should delete linked shift_exchange_requests rows for requester/accepting shift ids',
  );
  assert.match(
    deleteBlock,
    /trx\('employee_shifts'\)\.where\(\{ id: existing\.id \}\)\.delete\(\)/,
    'processPlanningSlotDelete should still delete the shift row after child cleanup',
  );
});

test('shift authorization writes include company_id and schema allows overtime/shift-ended log types', () => {
  const employeeShiftSource = fs.readFileSync(employeeShiftControllerPath, 'utf8');
  const attendanceQueueSource = fs.readFileSync(attendanceQueueServicePath, 'utf8');
  const migration001Source = fs.readFileSync(singleDbMigrationPath, 'utf8');

  const overtimeBlock = employeeShiftSource.slice(
    employeeShiftSource.indexOf("const [auth] = await tenantDb('shift_authorizations')"),
    employeeShiftSource.indexOf("await tenantDb('employee_shifts')", employeeShiftSource.indexOf("const [auth] = await tenantDb('shift_authorizations')")),
  );
  assert.match(
    overtimeBlock,
    /insert\(\{\s*company_id:\s*resolvedCompanyId,/,
    'endShift overtime authorization insert should include company_id',
  );

  const earlyCheckInBlock = attendanceQueueSource.slice(
    attendanceQueueSource.indexOf('const auth = await deps.createShiftAuthorization({'),
    attendanceQueueSource.indexOf('await deps.incrementShiftPendingApprovals', attendanceQueueSource.indexOf('const auth = await deps.createShiftAuthorization({')),
  );
  assert.match(
    earlyCheckInBlock,
    /company_id:\s*payload\.companyId/,
    'early check-in queue authorization insert should include company_id',
  );

  const shiftLogsBlock = migration001Source.slice(
    migration001Source.indexOf("await knex.schema.createTable('shift_logs', (table) => {"),
    migration001Source.indexOf("await knex.schema.createTable('shift_authorizations', (table) => {"),
  );
  assert.match(
    shiftLogsBlock,
    /checkIn\(\['shift_updated',\s*'check_in',\s*'check_out',\s*'shift_ended',\s*'authorization_resolved'\]\)/,
    'shift_logs log_type check should allow shift_ended and authorization_resolved',
  );

  const shiftAuthBlock = migration001Source.slice(
    migration001Source.indexOf("await knex.schema.createTable('shift_authorizations', (table) => {"),
    migration001Source.indexOf("await knex.schema.createTable('authorization_requests', (table) => {"),
  );
  assert.match(
    shiftAuthBlock,
    /checkIn\(\['early_check_in',\s*'tardiness',\s*'early_check_out',\s*'late_check_out',\s*'overtime'\]\)/,
    'shift_authorizations auth_type check should allow overtime',
  );
  assert.match(
    shiftAuthBlock,
    /checkIn\(\['pending',\s*'approved',\s*'rejected',\s*'no_approval_needed',\s*'locked'\]\)/,
    'shift_authorizations status check should allow locked overtime rows',
  );
});

test('shift constraints alignment migration exists for live databases', () => {
  const migrationNames = fs.readdirSync(migrationsDirPath);
  const migrationName = migrationNames.find((name) => /007_.*shift.*constraint.*\.ts$/i.test(name));

  assert.ok(
    migrationName,
    'Expected a 007 shift constraint migration to align log_type and auth_type checks',
  );

  const source = fs.readFileSync(path.join(migrationsDirPath, migrationName!), 'utf8');
  assert.match(
    source,
    /shift_logs_log_type_check[\s\S]*shift_ended[\s\S]*authorization_resolved/,
    'Shift constraint migration should update shift_logs_log_type_check with shift_ended/authorization_resolved',
  );
  assert.match(
    source,
    /shift_authorizations_auth_type_check[\s\S]*overtime/,
    'Shift constraint migration should update shift_authorizations_auth_type_check with overtime',
  );
});

test('interim duty auth type migration exists for shift authorizations', () => {
  const migrationNames = fs.readdirSync(migrationsDirPath);
  const migrationName = migrationNames.find((name) => /015_.*interim.*duty.*\.ts$/i.test(name));

  assert.ok(
    migrationName,
    'Expected a 015 migration to add interim_duty to shift_authorizations auth_type check',
  );

  const source = fs.readFileSync(path.join(migrationsDirPath, migrationName!), 'utf8');
  assert.match(
    source,
    /shift_authorizations_auth_type_check[\s\S]*interim_duty/,
    'Interim duty migration should include interim_duty in shift_authorizations_auth_type_check',
  );
});

test('historical early check out approval migration exists', () => {
  const migrationNames = fs.readdirSync(migrationsDirPath);
  const migrationName = migrationNames.find((name) => /032_.*early.*check.*out.*\.ts$/i.test(name));

  assert.ok(
    migrationName,
    'Expected a 032 migration to normalize historical early_check_out no_approval_needed rows',
  );

  const source = fs.readFileSync(path.join(migrationsDirPath, migrationName!), 'utf8');
  assert.match(
    source,
    /\.where\(\{\s*auth_type:\s*'early_check_out',\s*status:\s*'no_approval_needed'\s*\}\)/,
    'Historical early_check_out migration should target no_approval_needed early_check_out rows',
  );
  assert.match(
    source,
    /status:\s*'approved'/,
    'Historical early_check_out migration should convert rows to approved',
  );
  assert.match(
    source,
    /resolved_at[\s\S]*(NOW\(\)|knex\.fn\.now)/i,
    'Historical early_check_out migration should stamp resolved_at',
  );
});

test('locked overtime status migration exists for shift authorizations', () => {
  const migrationNames = fs.readdirSync(migrationsDirPath);
  const migrationName = migrationNames.find((name) => /039_.*locked.*status.*\.ts$/i.test(name));

  assert.ok(
    migrationName,
    'Expected a 039 migration to add locked to shift_authorizations status',
  );

  const source = fs.readFileSync(path.join(migrationsDirPath, migrationName!), 'utf8');
  assert.match(
    source,
    /shift_authorizations_status_check[\s\S]*locked/,
    'Locked overtime migration should extend shift_authorizations_status_check with locked',
  );
});

test('authorization requests pending filter includes locked service-crew overtime rows', () => {
  const source = fs.readFileSync(authorizationRequestControllerPath, 'utf8');
  const listBlock = source.slice(
    source.indexOf('export async function list'),
    source.indexOf('/**\n * POST /authorization-requests/:id/approve'),
  );

  assert.match(
    listBlock,
    /if \(status === 'pending'\) \{\s*q = q\.whereIn\('shift_authorizations\.status', \['pending', 'locked'\]\);/s,
    'authorization requests list should include locked shift authorizations in the pending filter',
  );
});

test('authorization requests API and page expose approved/rejected reviewer names', () => {
  const controllerSource = fs.readFileSync(authorizationRequestControllerPath, 'utf8');
  const pageSource = fs.readFileSync(authorizationRequestsPagePath, 'utf8');

  assert.match(
    controllerSource,
    /reviewed_by_name:/,
    'authorizationRequest controller should expose reviewed_by_name on management requests',
  );
  assert.match(
    controllerSource,
    /resolved_by_name:/,
    'authorizationRequest controller should expose resolved_by_name on shift authorizations',
  );
  assert.match(
    controllerSource,
    /res\.json\(\{\s*success:\s*true,\s*data:\s*\{\s*\.\.\.updated,\s*reviewed_by_name:/,
    'management approve/reject responses should include reviewed_by_name',
  );

  assert.match(
    pageSource,
    /Approved by/,
    'AuthorizationRequestsPage should render "Approved by" label',
  );
  assert.match(
    pageSource,
    /Rejected by/,
    'AuthorizationRequestsPage should render "Rejected by" label',
  );
  assert.match(
    pageSource,
    /request\.(reviewed_by_name|reviewed_by)/,
    'AuthorizationRequestsPage management panel should read reviewer metadata',
  );
  assert.match(
    pageSource,
    /auth\.(resolved_by_name|resolved_by)/,
    'AuthorizationRequestsPage service crew panel should read resolver metadata',
  );
});

test('peer evaluation queue queries hr.attendance by x_company_id (not company_id)', () => {
  const source = fs.readFileSync(peerEvaluationQueueServicePath, 'utf8');

  const attendanceQueryBlock = source.slice(
    source.indexOf("callOdooKw('hr.attendance', 'search_read'"),
    source.indexOf('fields: [\'id\', \'employee_id\', \'check_in\', \'check_out\']'),
  );

  assert.match(
    attendanceQueryBlock,
    /\['x_company_id',\s*'=',\s*Number\(payload\.branchOdooId\)\]/,
    'peer evaluation queue should filter hr.attendance by x_company_id',
  );
  assert.doesNotMatch(
    attendanceQueryBlock,
    /\['company_id',\s*'=',\s*Number\(payload\.branchOdooId\)\]/,
    'peer evaluation queue should not filter hr.attendance by company_id',
  );
});

test('peer evaluation queue normalizes shift datetimes before hr.attendance domain query', () => {
  const queueSource = fs.readFileSync(peerEvaluationQueueServicePath, 'utf8');
  const shiftControllerSource = fs.readFileSync(employeeShiftControllerPath, 'utf8');

  assert.match(
    queueSource,
    /toOdooDateTime\(/,
    'peer evaluation queue should normalize date values using toOdooDateTime helper',
  );
  assert.match(
    queueSource,
    /parseOdooUtcDateTime\(/,
    'peer evaluation queue should parse Odoo attendance datetimes via UTC-aware helper',
  );

  const attendanceQueryBlock = queueSource.slice(
    queueSource.indexOf("callOdooKw('hr.attendance', 'search_read'"),
    queueSource.indexOf('fields: [\'id\', \'employee_id\', \'check_in\', \'check_out\']'),
  );

  assert.doesNotMatch(
    attendanceQueryBlock,
    /\['check_in',\s*'<',\s*payload\.shiftEnd\]/,
    'peer evaluation queue should not pass raw payload.shiftEnd into Odoo domain',
  );
  assert.doesNotMatch(
    attendanceQueryBlock,
    /\['check_out',\s*'>',\s*payload\.shiftStart\]/,
    'peer evaluation queue should not pass raw payload.shiftStart into Odoo domain',
  );
  assert.doesNotMatch(
    queueSource,
    /new Date\(attendance\.check_in\)\.getTime\(\)/,
    'peer evaluation queue should not parse attendance.check_in with naive Date constructor',
  );
  assert.doesNotMatch(
    queueSource,
    /new Date\(attendance\.check_out\)\.getTime\(\)/,
    'peer evaluation queue should not parse attendance.check_out with naive Date constructor',
  );

  assert.match(
    shiftControllerSource,
    /shiftStart:\s*new Date\(shift\.shift_start(?:\s+as\s+string\s+\|\s+Date)?\)\.toISOString\(\)/,
    'endShift should enqueue peer evaluation jobs with ISO shiftStart payloads',
  );
  assert.match(
    shiftControllerSource,
    /shiftEnd:\s*new Date\(shift\.shift_end(?:\s+as\s+string\s+\|\s+Date)?\)\.toISOString\(\)/,
    'endShift should enqueue peer evaluation jobs with scheduled shift_end ISO payloads',
  );
  assert.doesNotMatch(
    shiftControllerSource,
    /shiftEnd:\s*new Date\(\)\.toISOString\(\)/,
    'endShift should not enqueue peer evaluation jobs with current time as shiftEnd',
  );
});

test('peer evaluation queue resolves Odoo x_website_key via users.user_key and inserts users.id', () => {
  const queueSource = fs.readFileSync(peerEvaluationQueueServicePath, 'utf8');

  assert.match(
    queueSource,
    /whereIn\('user_key',\s*websiteKeys\)/,
    'peer evaluation queue should map x_website_key values to users via users.user_key',
  );
  assert.doesNotMatch(
    queueSource,
    /whereIn\('id',\s*websiteKeys\)/,
    'peer evaluation queue should not map x_website_key directly against users.id',
  );
  assert.match(
    queueSource,
    /if \(resolvedUserId === payload\.shiftUserId\) continue;/,
    'peer evaluation queue should filter self-evaluation using resolved users.id',
  );
  assert.match(
    queueSource,
    /qualifyingCoworkers\.push\(\{\s*userId:\s*resolvedUserId,\s*overlapMinutes:\s*totalOverlap\s*\}\)/,
    'peer evaluation queue should insert resolved users.id into peer_evaluations',
  );
  assert.match(
    queueSource,
    /insert\(\{\s*company_id:\s*payload\.companyId,\s*evaluator_user_id:\s*payload\.shiftUserId,/,
    'peer evaluation queue should include company_id when inserting peer_evaluations',
  );
  assert.match(
    queueSource,
    /'Peer evaluation job failed'/,
    'peer evaluation queue worker should log failed jobs before retrying',
  );
});

test('peer evaluation submission no longer writes legacy users.peer_evaluations jsonb column', () => {
  const serviceSource = fs.readFileSync(peerEvaluationServicePath, 'utf8');

  assert.doesNotMatch(
    serviceSource,
    /coalesce\(peer_evaluations,\s*'\[\]'::jsonb\)\s*\|\|/,
    'peer evaluation submit flow should not append to removed users.peer_evaluations column',
  );
  assert.doesNotMatch(
    serviceSource,
    /await\s+masterDb\('users'\)/,
    'peer evaluation submit flow should not update users table for peer evaluation snapshots',
  );
});

test('peer evaluation lifecycle writes shift activity logs for available/submitted/expired states', () => {
  const queueSource = fs.readFileSync(peerEvaluationQueueServicePath, 'utf8');
  const controllerSource = fs.readFileSync(peerEvaluationControllerPath, 'utf8');
  const cronSource = fs.readFileSync(peerEvaluationCronServicePath, 'utf8');

  assert.match(
    queueSource,
    /log_type:\s*'peer_evaluation_available'/,
    'peer evaluation queue should write peer_evaluation_available shift logs',
  );
  assert.match(
    queueSource,
    /of\('\/employee-shifts'\)\.to\(`branch:\$\{payload\.branchId\}`\)\.emit\('shift:log-new',\s*availabilityLog\)/,
    'peer evaluation queue should emit peer_evaluation_available logs over /employee-shifts sockets',
  );
  assert.match(
    controllerSource,
    /log_type:\s*'peer_evaluation_submitted'/,
    'peer evaluation submit controller should write peer_evaluation_submitted shift logs',
  );
  assert.match(
    cronSource,
    /log_type:\s*'peer_evaluation_expired'/,
    'peer evaluation expiry cron should write peer_evaluation_expired shift logs',
  );
});

test('peer evaluation shift log type migration exists for live databases', () => {
  const migrationNames = fs.readdirSync(migrationsDirPath);
  const migrationName = migrationNames.find((name) => /008_.*shift.*log.*peer.*evaluation.*\.ts$/i.test(name));

  assert.ok(
    migrationName,
    'Expected an 008 migration that extends shift_logs log_type for peer evaluation lifecycle entries',
  );

  const source = fs.readFileSync(path.join(migrationsDirPath, migrationName!), 'utf8');
  assert.match(
    source,
    /shift_logs_log_type_check[\s\S]*peer_evaluation_available[\s\S]*peer_evaluation_submitted[\s\S]*peer_evaluation_expired/,
    'peer evaluation shift-log migration should include available/submitted/expired log types',
  );
});
