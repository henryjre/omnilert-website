import type { SelectorCompanyGroup } from '@/shared/components/branchSelectorState';

export type PayrollRequestStatus = 'pending' | 'approved' | 'rejected';
export type PayrollRequestType = 'issuance' | 'deduction';

export interface PayrollBranchOption {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  themeColor: string | null;
  isMainBranch: boolean;
}

export interface PayrollEmployeeOption {
  id: string;
  name: string;
  role: string;
  avatar_url: string | null;
  branchId: string;
  branchName: string;
  companyName: string;
}

export interface PayrollRequestRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  employeeAvatarUrl: string | null;
  branchId: string;
  branchName: string;
  companyName: string;
  type: PayrollRequestType;
  amount: number;
  reason: string;
  status: PayrollRequestStatus;
  submittedAt: string;
  submittedByName: string;
}

const MOCK_EMPLOYEE_NAMES = [
  'Juan Dela Cruz',
  'Maria Santos',
  'Pedro Reyes',
  'Anne Flores',
  'Carlo Mendoza',
  'Liza Navarro',
  'Miguel Ramos',
  'Jessa Garcia',
  'Paolo Aquino',
  'Bianca Cruz',
  'Noel Villanueva',
  'Ivy Torres',
];

const MOCK_EMPLOYEE_ROLES = [
  'Shift Lead',
  'Cashier',
  'Service Crew',
  'Inventory Staff',
];

const MOCK_REQUEST_AMOUNTS = [1250, 420, 860, 310, 540, 975];
const MOCK_REQUEST_REASONS = [
  'Payroll correction for previous cutoff.',
  'Late attendance penalty review.',
  'Store cash variance adjustment.',
  'Uniform replacement deduction.',
  'Sales incentive issuance.',
  'Damage accountability deduction.',
];
const MOCK_REQUEST_STATUSES: PayrollRequestStatus[] = [
  'pending',
  'approved',
  'rejected',
  'pending',
  'approved',
  'pending',
];
const MOCK_REQUEST_DATES = [
  '2026-04-20T09:15:00.000Z',
  '2026-04-18T13:40:00.000Z',
  '2026-04-16T11:05:00.000Z',
  '2026-04-14T15:25:00.000Z',
  '2026-04-11T08:30:00.000Z',
  '2026-04-09T17:10:00.000Z',
];

export function buildPayrollBranchOptions(groups: SelectorCompanyGroup[]): PayrollBranchOption[] {
  return groups.flatMap((group) =>
    group.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      companyId: branch.companyId,
      companyName: branch.companyName,
      themeColor: group.themeColor ?? null,
      isMainBranch: Boolean(branch.is_main_branch),
    })),
  );
}

export function createPayrollMockEmployees(
  branches: PayrollBranchOption[],
): PayrollEmployeeOption[] {
  return branches.flatMap((branch, branchIndex) =>
    Array.from({ length: 3 }, (_, employeeIndex) => {
      const seed = branchIndex * 3 + employeeIndex;
      return {
        id: `${branch.id}-employee-${employeeIndex + 1}`,
        name: MOCK_EMPLOYEE_NAMES[seed % MOCK_EMPLOYEE_NAMES.length],
        role: MOCK_EMPLOYEE_ROLES[seed % MOCK_EMPLOYEE_ROLES.length],
        avatar_url: null,
        branchId: branch.id,
        branchName: branch.name,
        companyName: branch.companyName,
      };
    }),
  );
}

export function createPayrollSeedRequests(
  employees: PayrollEmployeeOption[],
  submittedByName: string,
): PayrollRequestRecord[] {
  return employees.slice(0, 6).map((employee, index) => ({
    id: `seed-${employee.id}`,
    employeeId: employee.id,
    employeeName: employee.name,
    employeeRole: employee.role,
    employeeAvatarUrl: employee.avatar_url,
    branchId: employee.branchId,
    branchName: employee.branchName,
    companyName: employee.companyName,
    type: index % 2 === 0 ? 'deduction' : 'issuance',
    amount: MOCK_REQUEST_AMOUNTS[index % MOCK_REQUEST_AMOUNTS.length] ?? 500,
    reason: MOCK_REQUEST_REASONS[index % MOCK_REQUEST_REASONS.length] ?? 'Payroll adjustment.',
    status: MOCK_REQUEST_STATUSES[index % MOCK_REQUEST_STATUSES.length] ?? 'pending',
    submittedAt: MOCK_REQUEST_DATES[index % MOCK_REQUEST_DATES.length] ?? new Date().toISOString(),
    submittedByName,
  }));
}

export function formatPayrollRequestCurrency(value: number): string {
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPayrollRequestDate(
  iso: string,
  style: 'short' | 'long' = 'short',
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  if (style === 'long') {
    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getPayrollRequestStatusVariant(
  status: PayrollRequestStatus,
): 'warning' | 'success' | 'danger' {
  if (status === 'pending') return 'warning';
  if (status === 'approved') return 'success';
  return 'danger';
}

export function getPayrollRequestStatusLabel(status: PayrollRequestStatus): string {
  if (status === 'pending') return 'Pending';
  if (status === 'approved') return 'Approved';
  return 'Rejected';
}

export function getPayrollRequestTypeLabel(type: PayrollRequestType): string {
  return type === 'issuance' ? 'Issuance' : 'Deduction';
}

export function getPayrollEmployeeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'NA';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}
