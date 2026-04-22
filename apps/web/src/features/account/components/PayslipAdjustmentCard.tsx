import { memo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronRight } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import {
  formatPayslipAdjustmentCurrency,
  formatPayslipAdjustmentDate,
  getPayslipAdjustmentStatusLabel,
  getPayslipAdjustmentStatusVariant,
  type PayslipAdjustmentRecord,
} from './payslipAdjustments.shared';

interface PayslipAdjustmentCardProps {
  adjustment: PayslipAdjustmentRecord;
  selected: boolean;
  onClick: (id: string) => void;
}

export const PayslipAdjustmentCard = memo(function PayslipAdjustmentCard({
  adjustment,
  selected,
  onClick,
}: PayslipAdjustmentCardProps) {
  const isIssuance = adjustment.type === 'issuance';

  return (
    <button
      type="button"
      onClick={() => onClick(adjustment.id)}
      className={`w-full rounded-xl border bg-white px-4 py-3.5 text-left transition-colors ${
        selected
          ? 'border-primary-200 bg-primary-50/40 ring-1 ring-primary-200'
          : 'border-gray-200 hover:border-primary-200 hover:bg-primary-50/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {isIssuance ? (
              <ArrowUpCircle className="h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <ArrowDownCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <p className="truncate font-semibold text-gray-900">{adjustment.companyName}</p>
          </div>
          <p className="mt-1 truncate text-xs text-gray-500">Branch: {adjustment.branchName}</p>
          <p className="mt-1 truncate text-xs text-gray-500">Issuer: {adjustment.issuerName}</p>
        </div>

        <Badge
          variant={getPayslipAdjustmentStatusVariant(adjustment.status)}
          className="shrink-0"
        >
          {getPayslipAdjustmentStatusLabel(adjustment.status)}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-2.5">
        <p className="truncate text-xs text-gray-400">
          {formatPayslipAdjustmentDate(adjustment.submittedAt)}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <p className={`text-sm font-bold tabular-nums ${isIssuance ? 'text-green-700' : 'text-red-700'}`}>
            {isIssuance ? '+' : '−'}
            {formatPayslipAdjustmentCurrency(adjustment.amount)}
          </p>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </button>
  );
});
