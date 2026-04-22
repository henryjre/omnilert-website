import assert from 'node:assert/strict';
import test from 'node:test';

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

  assert.deepEqual(allocations, [
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

  assert.deepEqual(allocations, [
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
  assert.equal(
    derivePayrollAdjustmentParentStatus(['pending', 'in_progress']),
    'employee_approval',
  );
});

test('derivePayrollAdjustmentParentStatus moves to in progress once all targets authorize', () => {
  assert.equal(
    derivePayrollAdjustmentParentStatus(['in_progress', 'in_progress']),
    'in_progress',
  );
});

test('derivePayrollAdjustmentParentStatus moves to completed once all targets complete', () => {
  assert.equal(
    derivePayrollAdjustmentParentStatus(['completed', 'completed']),
    'completed',
  );
});
