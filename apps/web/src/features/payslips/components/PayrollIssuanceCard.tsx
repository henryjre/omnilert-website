import { memo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronRight, Users } from 'lucide-react';
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

function AvatarStack({ request }: { request: PayrollRequestRecord }) {
  const visibleTargets = request.targets.slice(0, 3);
  const overflow = request.targets.length > 3 ? request.targets.length - 3 : 0;

  return (
    <div className="flex items-center">
      {visibleTargets.map((target, index) => (
        <div
          key={target.id}
          className={`ring-2 ring-white ${index > 0 ? '-ml-2' : ''} flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-xs font-semibold text-primary-700`}
        >
          {target.employeeAvatarUrl?.trim() ? (
            <img
              src={target.employeeAvatarUrl}
              alt={target.employeeName}
              className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            getPayrollEmployeeInitials(target.employeeName)
          )}
        </div>
      ))}
      {overflow > 0 ? (
        <div className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600 ring-2 ring-white">
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}

export const PayrollIssuanceCard = memo(function PayrollIssuanceCard({
  request,
  selected,
  onClick,
}: PayrollIssuanceCardProps) {
  const isIssuance = request.type === 'issuance';
  const isMultiEmployee = request.targets.length > 1;
  const primaryEmployee = request.targets[0];
  const displayEmployeeName =
    isMultiEmployee ? 'Multiple Employees' : primaryEmployee?.employeeName ?? 'Unknown Employee';

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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative shrink-0">
            <AvatarStack request={request} />
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

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              {isMultiEmployee ? (
                <Users className="h-4 w-4 shrink-0 text-gray-400" />
              ) : null}
              <p className="truncate font-semibold text-gray-900">{displayEmployeeName}</p>
            </div>
            <p className="mt-1 truncate text-xs text-gray-500">
              {request.branchName}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-gray-400 sm:truncate">
              {request.createdByName}
            </p>
          </div>
        </div>

        <Badge
          variant={getPayrollRequestStatusVariant(request.status)}
          className="shrink-0 self-start"
        >
          {getPayrollRequestStatusLabel(request.status)}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <p className="text-xs text-gray-400">{formatPayrollRequestDate(request.createdAt)}</p>
        <div className="flex shrink-0 items-center gap-2">
          <p
            className={`text-sm font-bold tabular-nums ${
              isIssuance ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {isIssuance ? '+' : '−'}
            {formatPayrollRequestCurrency(request.totalAmount)}
          </p>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </button>
  );
});
