import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

process.env.JWT_SECRET ??= 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= 'test-bootstrap-secret-1234567890';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-123456';
process.env.ODOO_DB ??= 'test-odoo-db';
process.env.ODOO_URL ??= 'http://localhost:8069';
process.env.ODOO_USERNAME ??= 'test-odoo-user@example.com';
process.env.ODOO_PASSWORD ??= 'test-odoo-password';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_ORGANIZATION_ID ??= 'test-openai-org';
process.env.OPENAI_PROJECT_ID ??= 'test-openai-project';

const {
  splitPayrollAdjustmentAllocations,
  derivePayrollAdjustmentParentStatus,
} = await import('../payrollAdjustment.service.js');

test('splitPayrollAdjustmentAllocations assigns the centavo remainder to the last target', () => {
  const allocations = splitPayrollAdjustmentAllocations(100, ['user-1', 'user-2', 'user-3'], 1);

  expect(allocations).toEqual([
    {
      userId: 'user-1',
      allocatedTotalAmount: 33.33,
      allocatedMonthlyAmount: 33.33,
    },
    {
      userId: 'user-2',
      allocatedTotalAmount: 33.33,
      allocatedMonthlyAmount: 33.33,
    },
    {
      userId: 'user-3',
      allocatedTotalAmount: 33.34,
      allocatedMonthlyAmount: 33.34,
    },
  ]);
});

test('splitPayrollAdjustmentAllocations derives monthly amounts when payroll periods are limited', () => {
  const allocations = splitPayrollAdjustmentAllocations(900, ['user-1', 'user-2'], 3);

  expect(allocations).toEqual([
    {
      userId: 'user-1',
      allocatedTotalAmount: 450,
      allocatedMonthlyAmount: 150,
    },
    {
      userId: 'user-2',
      allocatedTotalAmount: 450,
      allocatedMonthlyAmount: 150,
    },
  ]);
});

test('derivePayrollAdjustmentParentStatus keeps employee approval until all targets authorize', () => {
  expect(
    derivePayrollAdjustmentParentStatus(['pending', 'in_progress']),
  ).toBe('employee_approval');
});

test('derivePayrollAdjustmentParentStatus moves to in progress once all targets authorize', () => {
  expect(
    derivePayrollAdjustmentParentStatus(['in_progress', 'in_progress']),
  ).toBe('in_progress');
});

test('derivePayrollAdjustmentParentStatus moves to completed once all targets complete', () => {
  expect(
    derivePayrollAdjustmentParentStatus(['completed', 'completed']),
  ).toBe('completed');
});

test('payroll adjustment mappings support system-created records', () => {
  const source = readFileSync(new URL('../payrollAdjustment.service.ts', import.meta.url), 'utf8');

  expect(source).toMatch(/createdByUserId:\s*row\.created_by_user_id \? String\(row\.created_by_user_id\) : null/);
  expect(source).toMatch(/createdByName:\s*row\.created_by_user_id \? normalizeName\(row\.created_by_name\) : 'Omnilert System'/);
  expect(source).toMatch(/processingOwnerName:[\s\S]*'Omnilert System'/);
  expect(source).toMatch(/approvedByName:[\s\S]*'Omnilert System'/);
  expect(source).toMatch(/leftJoin\('users as creator'/);
});

test('employee payroll authorization locks base rows before nullable creator joins', () => {
  const source = readFileSync(new URL('../payrollAdjustment.service.ts', import.meta.url), 'utf8');
  const helperStart = source.indexOf('async function loadTargetRowForEmployee');
  const helperEnd = source.indexOf('export async function listPayrollAdjustmentRequests');
  const helperSource = source.slice(helperStart, helperEnd);

  expect(helperSource).toMatch(/if \(forUpdate\)/);
  expect(helperSource).toMatch(/select\('target\.id'\)[\s\S]*\.forUpdate\(\)/);
  expect(helperSource).toMatch(/select\('request\.id'\)[\s\S]*\.forUpdate\(\)/);
  expect(helperSource).not.toMatch(/query = query\.forUpdate\(\)/);
});
