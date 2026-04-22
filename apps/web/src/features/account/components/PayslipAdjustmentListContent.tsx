import { CheckCircle2, Clock, FileEdit } from 'lucide-react';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { PayslipAdjustmentCard } from './PayslipAdjustmentCard';
import {
  getPayslipAdjustmentStatusLabel,
  type PayslipAdjustmentRecord,
  type PayslipAdjustmentStatus,
} from './payslipAdjustments.shared';

const STATUS_TABS: ViewOption<PayslipAdjustmentStatus>[] = [
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'in_progress', label: 'In Progress', icon: FileEdit },
  { id: 'completed', label: 'Completed', icon: CheckCircle2 },
];

function PayslipAdjustmentCardSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 rounded bg-gray-200" />
          <div className="h-3 w-32 rounded bg-gray-100" />
          <div className="h-3 w-28 rounded bg-gray-100" />
        </div>
        <div className="h-5 w-20 rounded-full bg-gray-200" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-2.5">
        <div className="h-3 w-32 rounded bg-gray-100" />
        <div className="h-4 w-24 rounded bg-gray-200" />
      </div>
    </div>
  );
}

interface PayslipAdjustmentListContentProps {
  loading: boolean;
  items: PayslipAdjustmentRecord[];
  total: number;
  statusFilter: PayslipAdjustmentStatus;
  selectedAdjustmentId: string | null;
  currentPage: number;
  totalPages: number;
  onStatusFilterChange: (filter: PayslipAdjustmentStatus) => void;
  onSelectAdjustment: (id: string) => void;
  onPageChange: (page: number) => void;
}

export function PayslipAdjustmentListContent({
  loading,
  items,
  total,
  statusFilter,
  selectedAdjustmentId,
  currentPage,
  totalPages,
  onStatusFilterChange,
  onSelectAdjustment,
  onPageChange,
}: PayslipAdjustmentListContentProps) {
  const statusLabel = getPayslipAdjustmentStatusLabel(statusFilter).toLowerCase();

  return (
    <div className="space-y-5">
      <ViewToggle
        options={STATUS_TABS}
        activeId={statusFilter}
        onChange={onStatusFilterChange}
        layoutId="payslip-adjustment-status-tabs"
        labelAboveOnMobile
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <PayslipAdjustmentCardSkeleton key={index} />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <FileEdit className="h-4 w-4 shrink-0 text-gray-300" />
          <p className="text-sm text-gray-400">
            No {statusLabel} adjustments found.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((adjustment) => (
            <PayslipAdjustmentCard
              key={adjustment.id}
              adjustment={adjustment}
              selected={adjustment.id === selectedAdjustmentId}
              onClick={onSelectAdjustment}
            />
          ))}

          {totalPages > 1 ? (
            <div className="border-t border-gray-100 pt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={onPageChange}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
