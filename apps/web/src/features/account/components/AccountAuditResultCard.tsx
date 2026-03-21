import React from 'react';
import type { AccountAuditResultListItem } from '@omnilert/shared';
import { ShieldCheck, Star } from 'lucide-react';

function formatDateTime(value: string | null): string {
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
      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
        selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${typeStyles}`}
          >
            <TypeIcon className="h-3 w-3" />
            {typeLabel}
          </span>
          <p className="text-sm font-semibold text-gray-900">{audit.type_label}</p>
        </div>
        <span className="text-right text-xs text-gray-500">
          {formatDateTime(audit.completed_at)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-600">
        <span className="truncate">Branch: {audit.branch.name}</span>
        <span className="shrink-0">
          Observed: {formatDateTime(audit.observed_at)}
        </span>
      </div>

      <div className="mt-1 text-xs text-gray-500">
        Company: {audit.company?.name || '-'}
      </div>

      <div className="mt-2 text-sm font-medium text-gray-800">
        {audit.summary.result_line}
      </div>
    </button>
  );
}
