import React from "react";
import type { PayslipListItem, PayslipStatus } from "@omnilert/shared";
import { Calendar, Clock } from "lucide-react";

/** Formats a number as Philippine Peso currency */
function formatPHP(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);
}

/** Formats a YYYY-MM-DD date string to "Mar 01, 2026" */
function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

interface StatusBadgeConfig {
  label: string;
  className: string;
}

/** Returns display config for each PayslipStatus value */
function getStatusBadge(status: PayslipStatus): StatusBadgeConfig {
  switch (status) {
    case "pending":
      return {
        label: "Pending",
        className: "bg-amber-50 text-amber-700 ring-amber-200",
      };
    case "draft":
      return {
        label: "Draft",
        className: "bg-blue-50 text-blue-700 ring-blue-200",
      };
    case "completed":
      return {
        label: "Completed",
        className: "bg-green-50 text-green-700 ring-green-200",
      };
  }
}

interface PayslipCardProps {
  /** The payslip metadata item to display */
  payslip: PayslipListItem;
  /** Whether this card is currently selected (side panel open) */
  selected: boolean;
  /** Called when the card is clicked */
  onSelect: () => void;
}

/**
 * Clickable card that shows payslip metadata in the list view.
 * Follows the AccountAuditResultCard pattern.
 */
export function PayslipCard({ payslip, selected, onSelect }: PayslipCardProps) {
  const badge = getStatusBadge(payslip.status);
  const cutoffLabel = payslip.cutoff === 1 ? "1st Cutoff" : "2nd Cutoff";
  const periodLabel = `${formatShortDate(payslip.date_from)} – ${formatShortDate(payslip.date_to)}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-4 py-3.5 text-left transition-colors ${
        selected
          ? "border-primary-500 bg-primary-50"
          : "border-gray-200 bg-white hover:bg-gray-50"
      }`}
    >
      {/* Top row: status badge + period */}
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}
        >
          {badge.label}
        </span>
        <span className="shrink-0 text-right text-xs font-medium text-gray-500">
          {cutoffLabel}
        </span>
      </div>

      {/* Period dates */}
      <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        {periodLabel}
      </div>

      {/* Company / branch name + net pay */}
      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span className="truncate">{payslip.company_name}</span>
        {payslip.is_pending ? (
          <span className="flex shrink-0 items-center gap-1 text-amber-600">
            <Clock className="h-3 w-3" />
            Not yet generated
          </span>
        ) : payslip.net_pay !== undefined ? (
          <span className="shrink-0 font-semibold text-gray-700">
            {formatPHP(payslip.net_pay)}
          </span>
        ) : null}
      </div>
    </button>
  );
}
