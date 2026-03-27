import React from "react";
import type { PayslipListItem, PayslipStatus } from "@omnilert/shared";
import { FileText, LayoutGrid, Clock, FileEdit, CheckCircle2 } from "lucide-react";
import { Pagination } from "../../../shared/components/ui/Pagination";
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

const STATUS_TABS: TabConfig[] = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "pending", label: "Pending", icon: Clock },
  { key: "draft", label: "Draft", icon: FileEdit },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
];

interface PayslipListContentProps {
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
  loading,
  items,
  total,
  statusFilter,
  selectedPayslipId,
  currentPage,
  totalPages,
  onStatusFilterChange,
  onSelectPayslip,
  onPageChange,
}: PayslipListContentProps) {
  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Payslip</h1>
        </div>
        {/* Mobile: active tab name as a compact subtitle */}
        <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
          {STATUS_TABS.find((t) => t.key === statusFilter)?.label}
        </p>
        {/* Desktop: full description */}
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          View your payslip history. Click a card to see the full breakdown.
        </p>
      </div>

      {/* Status filter tabs */}
      <div className="flex w-full gap-1 border-b border-gray-200 sm:w-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onStatusFilterChange(tab.key)}
            className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              statusFilter === tab.key
                ? "border-primary-600 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

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
