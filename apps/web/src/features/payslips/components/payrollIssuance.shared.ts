import type {
  PayrollAdjustmentManagerStatus,
  PayrollAdjustmentRequestDetail,
  PayrollAdjustmentRequestSummary,
  PayrollAdjustmentType,
} from '@omnilert/shared';
import type { SelectorCompanyGroup } from '@/shared/components/branchSelectorState';

export type PayrollRequestStatus = PayrollAdjustmentManagerStatus;
export type PayrollRequestStatusTab = 'all' | PayrollAdjustmentManagerStatus;
export type PayrollRequestType = PayrollAdjustmentType;
export type PayrollRequestRecord = PayrollAdjustmentRequestSummary;
export type PayrollRequestDetailRecord = PayrollAdjustmentRequestDetail;

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
): 'warning' | 'info' | 'success' | 'danger' {
  if (status === 'pending') return 'warning';
  if (status === 'completed') return 'success';
  if (status === 'rejected') return 'danger';
  return 'info';
}

export function getPayrollRequestStatusLabel(status: PayrollRequestStatus): string {
  if (status === 'employee_approval') return 'Employee Approval';
  if (status === 'in_progress') return 'In Progress';
  return status
    .split('_')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

export function getPayrollRequestTypeLabel(type: PayrollRequestType): string {
  return type === 'issuance' ? 'Add' : 'Deduct';
}

export function getPayrollAdjustmentActionLabel(type: PayrollRequestType): string {
  return type === 'issuance' ? 'added' : 'deducted';
}

export function getPayrollEmployeeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'NA';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

export function calculatePayrollSplit(
  totalAmount: number,
  employeeCount: number,
  payrollPeriods: number,
): Array<{ allocatedTotalAmount: number; allocatedMonthlyAmount: number }> {
  if (employeeCount <= 0) return [];
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / employeeCount);
  const remainderCents = totalCents - baseCents * employeeCount;

  return Array.from({ length: employeeCount }, (_, index) => {
    const allocatedTotalCents = baseCents + (index === employeeCount - 1 ? remainderCents : 0);
    const allocatedMonthlyCents =
      payrollPeriods > 1
        ? Math.round(allocatedTotalCents / payrollPeriods)
        : allocatedTotalCents;

    return {
      allocatedTotalAmount: Number((allocatedTotalCents / 100).toFixed(2)),
      allocatedMonthlyAmount: Number((allocatedMonthlyCents / 100).toFixed(2)),
    };
  });
}
