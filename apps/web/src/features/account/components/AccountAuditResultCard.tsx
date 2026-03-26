import React from 'react';
import type { AccountAuditResultListItem } from '@omnilert/shared';
import { Building2, ChevronRight, GitBranch, ShieldCheck, Star } from 'lucide-react';

function formatDate(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function AccountAuditResultCard({
  audit,
  selected,
  onSelect,
}: {
  audit: AccountAuditResultListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const TypeIcon = audit.type === 'customer_service' ? Star : ShieldCheck;
  const typeStyles = audit.type === 'customer_service'
    ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-blue-50 text-blue-700 ring-blue-200';
  const typeLabel = audit.type === 'customer_service' ? 'CSS' : 'Compliance';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-4 py-3.5 text-left transition-colors ${
        selected
          ? 'border-primary-300 bg-primary-50'
          : 'border-gray-200 bg-white hover:border-primary-200 hover:bg-primary-50/30'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: type badge + type label + branch + company */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${typeStyles}`}
            >
              <TypeIcon className="h-3 w-3" />
              {typeLabel}
            </span>
            <p className="truncate text-sm font-semibold text-gray-900">{audit.type_label}</p>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <GitBranch className="h-3 w-3 shrink-0 text-gray-400" />
              {audit.branch.name}
            </span>
            {audit.company?.name && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Building2 className="h-3 w-3 shrink-0" />
                {audit.company.name}
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-gray-400">{formatDate(audit.completed_at)}</p>
        </div>

        {/* Right: result line + chevron */}
        <div className="flex shrink-0 items-center gap-2">
          <p className="text-right text-sm font-semibold text-primary-700">
            {audit.summary.result_line.replace('Overall score: ', '').replace('Passed checks: ', '')}
          </p>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
        </div>
      </div>
    </button>
  );
}
