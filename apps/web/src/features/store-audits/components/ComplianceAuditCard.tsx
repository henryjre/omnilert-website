import type { StoreAudit } from '@omnilert/shared';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';

function statusVariant(status: StoreAudit['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'processing') return 'info' as const;
  return 'warning' as const;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: diffDays > 365 ? 'numeric' : undefined,
  });
}

export function ComplianceAuditCard({
  audit,
  selected,
  onSelect,
}: {
  audit: StoreAudit;
  selected: boolean;
  onSelect: () => void;
}) {
  const reward = Number(audit.monetary_reward ?? 0);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-full w-full flex-col rounded-xl border bg-white p-4 text-left transition-shadow hover:shadow-md ${
        selected ? 'border-primary-400 ring-2 ring-primary-200' : 'border-gray-200'
      }`}
    >
      {/* Top: type badge + employee name + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
            <ShieldCheck className="h-3 w-3" />
            Compliance
          </span>
          <p className="mt-1 truncate font-semibold text-gray-900">
            {audit.comp_employee_name || '—'}
          </p>
        </div>
        <Badge variant={statusVariant(audit.status)} className="shrink-0">
          {audit.status}
        </Badge>
      </div>

      {/* Metadata */}
      <div className="mt-1.5 min-w-0 space-y-0.5">
        {audit.company?.name && (
          <p className="truncate text-xs text-gray-500">{audit.company.name}</p>
        )}
        {audit.branch_name && (
          <p className="truncate text-xs text-primary-600">{audit.branch_name}</p>
        )}
        {audit.auditor_name && (
          <p className="truncate text-xs text-gray-400">Auditor: {audit.auditor_name}</p>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-2.5">
        <p className="text-xs text-gray-400">{formatDate(audit.created_at)}</p>
        <div className="flex shrink-0 items-center gap-2">
          {reward > 0 && (
            <span className="text-xs font-medium text-gray-600">
              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(reward)}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </button>
  );
}
