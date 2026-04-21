import { memo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronRight } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import {
  formatPayrollRequestCurrency,
  formatPayrollRequestDate,
  getPayrollEmployeeInitials,
  getPayrollRequestStatusLabel,
  getPayrollRequestStatusVariant,
  type PayrollRequestRecord,
} from './payrollIssuance.shared';

interface PayrollIssuanceCardProps {
  request: PayrollRequestRecord;
  selected: boolean;
  onClick: (id: string) => void;
}

export const PayrollIssuanceCard = memo(function PayrollIssuanceCard({
  request,
  selected,
  onClick,
}: PayrollIssuanceCardProps) {
  const isIssuance = request.type === 'issuance';

  return (
    <button
      type="button"
      onClick={() => onClick(request.id)}
      className={`w-full rounded-xl border bg-white px-4 py-3.5 text-left transition-colors ${
        selected
          ? 'border-primary-200 bg-primary-50/40 ring-1 ring-primary-200'
          : 'border-gray-200 hover:border-primary-200 hover:bg-primary-50/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative shrink-0">
            {request.employeeAvatarUrl ? (
              <img
                src={request.employeeAvatarUrl}
                alt={request.employeeName}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {getPayrollEmployeeInitials(request.employeeName)}
              </div>
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white ${
                isIssuance ? 'bg-green-100' : 'bg-red-100'
              }`}
            >
              {isIssuance ? (
                <ArrowUpCircle className="h-3 w-3 text-green-600" />
              ) : (
                <ArrowDownCircle className="h-3 w-3 text-red-600" />
              )}
            </span>
          </div>

          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{request.employeeName}</p>
            <p className="truncate text-xs text-gray-400">
              {request.branchName}
              {' · '}
              by {request.submittedByName}
            </p>
          </div>
        </div>

        <Badge variant={getPayrollRequestStatusVariant(request.status)} className="shrink-0">
          {getPayrollRequestStatusLabel(request.status)}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <p className="text-xs text-gray-400">{formatPayrollRequestDate(request.submittedAt)}</p>
        <div className="flex shrink-0 items-center gap-2">
          <p className={`text-sm font-bold tabular-nums ${isIssuance ? 'text-green-700' : 'text-red-700'}`}>
            {isIssuance ? '+' : '−'}
            {formatPayrollRequestCurrency(request.amount)}
          </p>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </button>
  );
});
