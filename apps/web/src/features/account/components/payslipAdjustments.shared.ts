import type {
  PayrollAdjustmentEmployeeItem,
  PayrollAdjustmentEmployeeStatus,
  PayrollAdjustmentType,
} from '@omnilert/shared';

export type AdjustmentCategoryTab = 'payslip' | 'adjustments';
export type PayslipAdjustmentStatus = PayrollAdjustmentEmployeeStatus;
export type PayslipAdjustmentType = PayrollAdjustmentType;
export type PayslipAdjustmentRecord = PayrollAdjustmentEmployeeItem;

export function formatPayslipAdjustmentCurrency(value: number): string {
  return `₱${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPayslipAdjustmentDate(
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

export function getPayslipAdjustmentStatusLabel(status: PayslipAdjustmentStatus): string {
  if (status === 'in_progress') return 'In Progress';
  return status === 'pending' ? 'Pending' : 'Completed';
}

export function getPayslipAdjustmentStatusVariant(
  status: PayslipAdjustmentStatus,
): 'warning' | 'info' | 'success' {
  if (status === 'pending') return 'warning';
  if (status === 'in_progress') return 'info';
  return 'success';
}

export function getPayslipAdjustmentTypeLabel(type: PayslipAdjustmentType): string {
  return type === 'issuance' ? 'Issuance' : 'Deduction';
}

export function getPayslipAdjustmentActionLabel(type: PayslipAdjustmentType): string {
  return type === 'issuance' ? 'added' : 'deducted';
}
