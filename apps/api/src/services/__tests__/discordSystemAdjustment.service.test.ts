import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const serviceSource = readFileSync(
  new URL('../discordSystemAdjustment.service.ts', import.meta.url),
  'utf8',
);

test('discord system adjustments resolve users by active Discord ID', () => {
  expect(serviceSource).toMatch(/discord_user_id:\s*discordId/);
  expect(serviceSource).toMatch(/is_active:\s*true/);
});

test('discord system adjustments support single and bulk discord IDs', () => {
  expect(serviceSource).toMatch(/function normalizeDiscordIds/);
  expect(serviceSource).toMatch(/!Array\.isArray\(input\.discord_id\)/);
  expect(serviceSource).toMatch(/const items: DiscordSystemAdjustmentBulkItem\[\] = \[\]/);
  expect(serviceSource).toMatch(/for \(const discordId of discordIds\)/);
});

test('token pay and epi adjustments resolve only active company scope', () => {
  expect(serviceSource).toMatch(/function resolveActiveCompanyScope/);
  expect(serviceSource).toMatch(/residentCompanyIds\.length > 0/);
  expect(serviceSource).toMatch(/Could not infer an active company for this user/);
  expect(serviceSource).toMatch(/if \(input\.adjustmentType === 'token_pay'\)[\s\S]*resolveActiveCompanyScope/);
  expect(serviceSource).toMatch(/const companyId = await resolveActiveCompanyScope\(targetUser\.id\);\n  return createEpiDeduction/);
});

test('payroll adjustments resolve resident branch scope', () => {
  expect(serviceSource).toMatch(/'ucb\.assignment_type':\s*'resident'/);
  expect(serviceSource).toMatch(/Could not infer a single resident company and branch/);
  expect(serviceSource).toMatch(/if \(input\.adjustmentType === 'payroll'\)[\s\S]*resolveResidentScope/);
});

test('discord system token pay adjustments complete with null reviewer and issuer ids', () => {
  expect(serviceSource).toMatch(/type:\s*input\.direction === 'addition' \? 'credit' : 'debit'/);
  expect(serviceSource).toMatch(/issued_by:\s*SYSTEM_ACTOR_NAME/);
  expect(serviceSource).toMatch(/issued_by_user_id:\s*null/);
  expect(serviceSource).toMatch(/reviewed_by:\s*null/);
  expect(serviceSource).toMatch(/status:\s*'completed'/);
  expect(serviceSource).toMatch(/card\.points \+ input\.amount/);
  expect(serviceSource).toMatch(/card\.points - input\.amount/);
  expect(serviceSource).toMatch(/reason:\s*input\.reason/);
  expect(serviceSource).toMatch(/description:\s*input\.reason/);
});

test('discord system payroll adjustments await employee authorization', () => {
  expect(serviceSource).toMatch(/type:\s*input\.direction === 'addition' \? 'issuance' : 'deduction'/);
  expect(serviceSource).toMatch(/status:\s*'employee_approval'/);
  expect(serviceSource).toMatch(/created_by_user_id:\s*null/);
  expect(serviceSource).toMatch(/approved_by_user_id:\s*null/);
  expect(serviceSource).toMatch(/status:\s*'pending'/);
  expect(serviceSource).toMatch(/reason:\s*input\.reason/);
  expect(serviceSource).not.toMatch(/createPayrollAdjustmentSalaryAttachment/);
});

test('discord system epi adjustments create approved signed adjustments as system records', () => {
  expect(serviceSource).toMatch(/createAutoApprovedEpiAdjustment/);
  expect(serviceSource).toMatch(/createdByUserId:\s*null/);
  expect(serviceSource).toMatch(/epiDelta:\s*input\.direction === 'addition' \? input\.amount : -input\.amount/);
  expect(serviceSource).toMatch(/reason:\s*input\.reason/);
  expect(serviceSource).toMatch(/status:\s*'approved'/);
});
