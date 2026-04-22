import React from "react";
import type { PayslipListItem, PayslipStatus } from "@omnilert/shared";
import { FileText, LayoutGrid, Clock, FileEdit, CheckCircle2 } from "lucide-react";
import { Pagination } from "../../../shared/components/ui/Pagination";
import { ViewToggle, type ViewOption } from "@/shared/components/ui/ViewToggle";
import { PayslipCard } from "./PayslipCard";

type StatusFilter = "all" | PayslipStatus;

interface TabConfig {
  key: StatusFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Skeleton placeholder that mirrors the PayslipCard layout.
 * Shown while the payslip list is loading.
 */
function PayslipCardSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      {/* Top row: badge pill + cutoff label */}
      <div className="flex items-start justify-between gap-3">
        <div className="h-5 w-16 rounded-md bg-gray-200" />
        <div className="h-4 w-14 rounded bg-gray-200" />
      </div>

      {/* Period row */}
      <div className="mt-2 flex items-center gap-1.5">
        <div className="h-3.5 w-3.5 shrink-0 rounded-full bg-gray-200" />
        <div className="h-4 w-48 rounded bg-gray-200" />
      </div>

      {/* Branch name + net pay row */}
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="h-3.5 w-36 rounded bg-gray-200" />
        <div className="h-3.5 w-20 rounded bg-gray-200" />
      </div>
    </div>
  );
}

const STATUS_TABS: ViewOption<StatusFilter>[] = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "pending", label: "Pending", icon: Clock },
  { id: "draft", label: "Draft", icon: FileEdit },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
];

interface PayslipListContentProps {
  /** Whether to render the page header inside this component */
  showHeader?: boolean;
  /** Whether the initial payslip list is loading */
  loading: boolean;
  /** Filtered + paginated items to display */
  items: PayslipListItem[];
  /** Total number of items after filtering (before pagination) */
  total: number;
  /** Currently active status filter */
  statusFilter: StatusFilter;
  /** The currently selected payslip id */
  selectedPayslipId: string | null;
  /** Label for selected branches */
  branchLabel?: string;
  /** Current page number (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Called when user changes the status filter tab */
  onStatusFilterChange: (filter: StatusFilter) => void;
  /** Called when user clicks a payslip card */
  onSelectPayslip: (id: string) => void;
  /** Called when user navigates to a page */
  onPageChange: (page: number) => void;
}

/**
 * Presentational component for the payslip list page.
 * Renders the page header, status filter tabs, payslip cards, and pagination.
 */
export function PayslipListContent({
  showHeader = true,
  loading,
  items,
  total,
  statusFilter,
  selectedPayslipId,
  branchLabel,
  currentPage,
  totalPages,
  onStatusFilterChange,
  onSelectPayslip,
  onPageChange,
}: PayslipListContentProps) {
  return (
    <div className="space-y-5">
      {showHeader ? (
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">My Payslip</h1>
            {branchLabel && (
              <span className="mt-1 hidden text-sm font-medium text-primary-600 sm:inline">
                {branchLabel}
              </span>
            )}
          </div>
          {branchLabel && (
            <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
              {branchLabel}
            </p>
          )}
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            View your payslip history. Click a card to see the full breakdown.
          </p>
        </div>
      ) : null}

      <ViewToggle
        options={STATUS_TABS}
        activeId={statusFilter}
        onChange={onStatusFilterChange}
        layoutId="payslip-status-tabs"
        labelAboveOnMobile
      />

      {/* Content area */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <PayslipCardSkeleton key={i} />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <FileText className="h-4 w-4 shrink-0 text-gray-300" />
          <p className="text-sm text-gray-400">
            {statusFilter === "all" ? "No payslips found." : `No ${statusFilter} payslips found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((payslip) => (
            <PayslipCard
              key={payslip.id}
              payslip={payslip}
              selected={payslip.id === selectedPayslipId}
              onSelect={() => onSelectPayslip(payslip.id)}
            />
          ))}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}
