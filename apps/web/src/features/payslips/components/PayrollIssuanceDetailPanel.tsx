import { ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import {
  formatPayrollRequestCurrency,
  formatPayrollRequestDate,
  getPayrollEmployeeInitials,
  getPayrollRequestStatusLabel,
  getPayrollRequestStatusVariant,
  type PayrollRequestRecord,
} from './payrollIssuance.shared';

interface PayrollIssuanceDetailPanelProps {
  request: PayrollRequestRecord;
  onClose: () => void;
}

export function PayrollIssuanceDetailPanel({
  request,
  onClose,
}: PayrollIssuanceDetailPanelProps) {
  const isIssuance = request.type === 'issuance';

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Payroll Request</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={`font-semibold ${isIssuance ? 'text-green-700' : 'text-red-700'}`}>
              {isIssuance ? 'Payroll Issuance' : 'Payroll Deduction'}
            </p>
            <Badge variant={getPayrollRequestStatusVariant(request.status)}>
              {getPayrollRequestStatusLabel(request.status)}
            </Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close panel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto bg-gray-50">
        <div className="mx-4 my-4 rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-col items-center px-6 pb-5 pt-6 text-center">
            {request.employeeAvatarUrl ? (
              <img
                src={request.employeeAvatarUrl}
                alt={request.employeeName}
                className="h-16 w-16 rounded-full object-cover ring-4 ring-gray-100"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700 ring-4 ring-gray-100">
                {getPayrollEmployeeInitials(request.employeeName)}
              </div>
            )}
            <p className="mt-3 text-xs font-medium uppercase tracking-widest text-gray-400">
              Target Employee
            </p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">{request.employeeName}</p>
            <p className="mt-1 text-sm text-gray-500">
              {request.employeeRole}
              {' · '}
              {request.branchName}
            </p>

            <div className="mt-4 flex items-baseline gap-1">
              {isIssuance ? (
                <ArrowUpCircle className="mb-0.5 h-5 w-5 text-green-500" />
              ) : (
                <ArrowDownCircle className="mb-0.5 h-5 w-5 text-red-500" />
              )}
              <span className={`text-4xl font-extrabold tabular-nums ${isIssuance ? 'text-green-600' : 'text-red-600'}`}>
                {isIssuance ? '+' : '−'}
                {formatPayrollRequestCurrency(request.amount)}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {isIssuance
                ? 'Will be added to the employee payroll adjustment.'
                : 'Will be deducted from the employee payroll adjustment.'}
            </p>
          </div>

          <div className="relative flex items-center px-4">
            <div className="absolute -left-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="absolute -right-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="w-full border-t-2 border-dashed border-gray-100" />
          </div>

          <div className="divide-y divide-dashed divide-gray-100 px-6 py-2">
            <div className="flex items-start justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Reason</span>
              <span className="max-w-[60%] text-right text-xs font-medium text-gray-700">
                {request.reason}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Branch</span>
              <span className="truncate text-right text-xs font-medium text-gray-700">
                {request.branchName}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Company</span>
              <span className="truncate text-right text-xs font-medium text-gray-700">
                {request.companyName}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Requested By</span>
              <span className="truncate text-right text-xs font-medium text-gray-700">
                {request.submittedByName}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Date Submitted</span>
              <span className="text-right text-xs font-medium text-gray-700">
                {formatPayrollRequestDate(request.submittedAt, 'long')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Status</span>
              <Badge variant={getPayrollRequestStatusVariant(request.status)}>
                {getPayrollRequestStatusLabel(request.status)}
              </Badge>
            </div>
          </div>

          <div className="h-4" />
        </div>
      </div>

      <div className="border-t border-gray-200 px-6 py-4">
        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
