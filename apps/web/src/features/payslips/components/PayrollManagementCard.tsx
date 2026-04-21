import React from 'react';
import type { PayslipListItem, PayslipStatus } from '@omnilert/shared';
import { Calendar, Clock } from 'lucide-react';

function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function getStatusBadge(status: PayslipStatus): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', className: 'bg-amber-50 text-amber-700 ring-amber-200' };
    case 'draft':
      return { label: 'Draft', className: 'bg-blue-50 text-blue-700 ring-blue-200' };
    case 'completed':
      return { label: 'Completed', className: 'bg-green-50 text-green-700 ring-green-200' };
  }
}

interface PayrollManagementCardProps {
  payslip: PayslipListItem;
  selected: boolean;
  onSelect: (id: string) => void;
}

export const PayrollManagementCard = React.memo(({ payslip, selected, onSelect }: PayrollManagementCardProps) => {
  const badge = getStatusBadge(payslip.status);
  const cutoffLabel = payslip.cutoff === 1 ? '1st Cutoff' : '2nd Cutoff';
  const periodLabel = `${formatShortDate(payslip.date_from)} – ${formatShortDate(payslip.date_to)}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(payslip.id)}
      className={`w-full rounded-xl border px-4 py-3.5 text-left transition-colors ${
        selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}
        >
          {badge.label}
        </span>
        <span className="shrink-0 text-right text-xs font-medium text-gray-500">{cutoffLabel}</span>
      </div>

      <div className="mt-1.5 text-sm font-semibold text-gray-900">{payslip.employee_name}</div>

      <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        {periodLabel}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span className="truncate">{payslip.company_name}</span>
        {payslip.is_pending ? (
          <span className="flex shrink-0 items-center gap-1 text-amber-600">
            <Clock className="h-3 w-3" />
            Not yet generated
          </span>
        ) : payslip.net_pay !== undefined ? (
          <span className="shrink-0 font-semibold text-gray-700">{formatPHP(payslip.net_pay)}</span>
        ) : null}
      </div>
    </button>
  );
});
PayrollManagementCard.displayName = 'PayrollManagementCard';
