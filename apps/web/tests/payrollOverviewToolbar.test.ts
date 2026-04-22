import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { PayslipListItem } from '@omnilert/shared';
import {
  buildGroupedEmployees,
  matchesPayrollOverviewStatusTab,
  resolvePayrollOverviewDisplayStatus,
  resolvePrimaryPayslip,
} from '../src/features/payslips/components/payrollOverview.shared.ts';

function buildPayslip(overrides: Partial<PayslipListItem>): PayslipListItem {
  return {
    id: 'sample-id',
    name: 'Sample Payslip',
    date_from: '2026-04-01',
    date_to: '2026-04-15',
    odoo_state: 'draft',
    status: 'draft',
    company_id: 7,
    company_name: 'Sample Branch',
    employee_id: 99,
    employee_name: '1001 - Sample Employee',
    cutoff: 1,
    is_pending: false,
    net_pay: 1250,
    avatar_url: null,
    ...overrides,
  };
}

test('grouped payroll employees use on_hold as the default All-tab priority and still match multiple status tabs', () => {
  const grouped = buildGroupedEmployees([
    buildPayslip({
      id: 'pending-1',
      status: 'pending',
      odoo_state: '',
      is_pending: true,
      company_name: 'North Branch',
      net_pay: undefined,
    }),
    buildPayslip({
      id: 'draft-1',
      status: 'draft',
      company_name: 'South Branch',
    }),
    buildPayslip({
      id: 'hold-1',
      status: 'on_hold',
      company_name: 'West Branch',
    }),
  ]);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].status, 'on_hold');
  assert.equal(matchesPayrollOverviewStatusTab(grouped[0], 'pending'), true);
  assert.equal(matchesPayrollOverviewStatusTab(grouped[0], 'draft'), true);
  assert.equal(matchesPayrollOverviewStatusTab(grouped[0], 'on_hold'), true);
  assert.equal(resolvePayrollOverviewDisplayStatus(grouped[0], 'all'), 'on_hold');
  assert.equal(resolvePayrollOverviewDisplayStatus(grouped[0], 'draft'), 'draft');
  assert.equal(resolvePrimaryPayslip(grouped[0].branches)?.id, 'hold-1');
  assert.equal(resolvePrimaryPayslip(grouped[0].branches, 'draft')?.id, 'draft-1');
});

test('PayrollOverviewTab renders the toolbar controls and refetches by active period', () => {
  const source = readFileSync(
    new URL('../src/features/payslips/components/PayrollOverviewTab.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /const \[activeStatusTab, setActiveStatusTab\] = useState<PayrollOverviewStatusTab>\('all'\);/,
    'PayrollOverviewTab should keep a dedicated sub-tab state',
  );
  assert.match(
    source,
    /const \[activePeriod, setActivePeriod\] = useState<PayrollOverviewPeriodOption>\('current'\);/,
    'PayrollOverviewTab should keep a dedicated current/previous period state',
  );
  assert.match(
    source,
    /fetchPayrollOverview\(\{\s*branchIds:[\s\S]*period: activePeriod,/,
    'PayrollOverviewTab should refetch overview data using the active period selection',
  );
  assert.match(
    source,
    /const canManage = hasPermission\(PERMISSIONS\.PAYSLIPS_MANAGE\);/,
    'PayrollOverviewTab should gate payroll validation behind manage permission',
  );
  assert.match(
    source,
    /const \[validationLoading, setValidationLoading\] = useState\(false\);/,
    'PayrollOverviewTab should track validate-button loading state',
  );
  assert.match(
    source,
    /const \[validationReport, setValidationReport\] = useState<PayrollOverviewValidationResponse \| null>\(null\);/,
    'PayrollOverviewTab should keep validation report state for the AnimatedModal',
  );
  assert.match(
    source,
    /validatePayrollOverview\(\{\s*branchIds:[\s\S]*period: activePeriod,/,
    'Validate Payroll should call the backend validation endpoint using the active period and branch scope',
  );
  assert.match(
    source,
    /<PayrollValidationReportModal[\s\S]*report=\{validationReport\}/,
    'PayrollOverviewTab should render the validation report modal when a report is available',
  );
});
