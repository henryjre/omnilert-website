import { ArrowDownCircle, ArrowUpCircle, CalendarDays, CheckCircle2, Clock, X } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { LinkedReason } from '@/shared/components/ui/LinkedReason';
import { Button } from '@/shared/components/ui/Button';
import {
  formatPayslipAdjustmentCurrency,
  formatPayslipAdjustmentDate,
  getPayslipAdjustmentStatusLabel,
  getPayslipAdjustmentStatusVariant,
  getPayslipAdjustmentTypeLabel,
  type PayslipAdjustmentRecord,
} from './payslipAdjustments.shared';

interface PayslipAdjustmentDetailPanelProps {
  adjustment: PayslipAdjustmentRecord;
  actionLoading?: boolean;
  onClose: () => void;
  onAuthorize?: () => void;
}

export function PayslipAdjustmentDetailPanel({
  adjustment,
  actionLoading = false,
  onClose,
  onAuthorize,
}: PayslipAdjustmentDetailPanelProps) {
  const isIssuance = adjustment.type === 'issuance';
  const showAuthorize = adjustment.status === 'pending' && Boolean(onAuthorize);
  const isMultiPeriod = adjustment.payrollPeriods > 1;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Payslip Adjustment</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={`font-semibold ${isIssuance ? 'text-green-700' : 'text-red-700'}`}>
              {getPayslipAdjustmentTypeLabel(adjustment.type)}
            </p>
            <Badge variant={getPayslipAdjustmentStatusVariant(adjustment.status)}>
              {getPayslipAdjustmentStatusLabel(adjustment.status)}
            </Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close adjustment detail"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto bg-gray-50">
        <div className="mx-4 my-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">

          {/* Amount hero */}
          <div className={`flex flex-col items-center px-6 pb-6 pt-7 text-center ${isIssuance ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className={`flex h-14 w-14 items-center justify-center rounded-full ${isIssuance ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {isIssuance ? <ArrowUpCircle className="h-7 w-7" /> : <ArrowDownCircle className="h-7 w-7" />}
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-widest text-gray-500">
              {isIssuance ? 'You will receive' : 'You will be deducted'}
            </p>
            <p className={`mt-1 text-4xl font-extrabold tabular-nums ${isIssuance ? 'text-green-700' : 'text-red-700'}`}>
              {isIssuance ? '+' : '−'}{formatPayslipAdjustmentCurrency(adjustment.amount)}
            </p>
            {isMultiPeriod && (
              <p className="mt-1.5 text-xs text-gray-500">
                {formatPayslipAdjustmentCurrency(adjustment.monthlyAmount)} &times; {adjustment.payrollPeriods} payslip periods
              </p>
            )}
          </div>

          {/* Tear line */}
          <div className="relative flex items-center">
            <div className="absolute -left-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="absolute -right-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="w-full border-t-2 border-dashed border-gray-100" />
          </div>

          {/* Receipt rows */}
          <div className="divide-y divide-dashed divide-gray-100 px-6 py-1">
            <div className="flex items-start justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">From</span>
              <div className="max-w-[60%] text-right">
                <p className="text-xs font-medium text-gray-700">{adjustment.issuerName}</p>
                <p className="text-[11px] text-gray-400">{adjustment.branchName}</p>
              </div>
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Reason</span>
              <span className="max-w-[60%] text-right text-xs font-medium text-gray-700">
                <LinkedReason value={adjustment.reason ?? ''} />
              </span>
            </div>
            <div className="flex items-start justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Submitted</span>
              <span className="max-w-[60%] text-right text-xs font-medium text-gray-700">
                {formatPayslipAdjustmentDate(adjustment.submittedAt, 'long')}
              </span>
            </div>
            {isMultiPeriod && (
              <div className="flex items-start justify-between gap-4 py-2.5">
                <span className="text-xs text-gray-400">Schedule</span>
                <div className="flex items-center gap-1.5 text-right">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="text-xs font-medium text-gray-700">
                    {formatPayslipAdjustmentCurrency(adjustment.monthlyAmount)} / period &times; {adjustment.payrollPeriods}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Tear line */}
          <div className="relative flex items-center">
            <div className="absolute -left-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="absolute -right-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="w-full border-t-2 border-dashed border-gray-100" />
          </div>

          {/* Status footer */}
          <div className="px-6 py-4">
            {adjustment.status === 'pending' && (
              <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <p className="text-xs font-semibold text-amber-800">Awaiting your authorization</p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    Review the details above and tap <span className="font-medium">Authorize</span> to confirm.
                  </p>
                </div>
              </div>
            )}
            {adjustment.status === 'in_progress' && (
              <div className="flex items-start gap-2.5 rounded-xl bg-blue-50 px-4 py-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <div>
                  <p className="text-xs font-semibold text-blue-800">Authorized — being processed</p>
                  <p className="mt-0.5 text-xs text-blue-700">
                    This adjustment has been authorized and will be applied to your upcoming payslip.
                  </p>
                </div>
              </div>
            )}
            {adjustment.status === 'completed' && (
              <div className="flex items-start gap-2.5 rounded-xl bg-green-50 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <div>
                  <p className="text-xs font-semibold text-green-800">Applied to your payslip</p>
                  {adjustment.authorizedAt && (
                    <p className="mt-0.5 text-xs text-green-700">
                      Authorized on {formatPayslipAdjustmentDate(adjustment.authorizedAt, 'long')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {showAuthorize && (
        <div className="border-t border-gray-200 px-6 py-4">
          <Button
            type="button"
            variant="success"
            className="w-full"
            disabled={actionLoading}
            onClick={onAuthorize}
          >
            {actionLoading ? 'Authorizing…' : 'Authorize'}
          </Button>
        </div>
      )}
    </div>
  );
}
