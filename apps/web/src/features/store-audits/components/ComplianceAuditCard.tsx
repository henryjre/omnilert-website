import type { StoreAudit } from '@omnilert/shared';
import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';

function statusVariant(status: StoreAudit['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'processing') return 'info' as const;
  return 'warning' as const;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
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
      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
        selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
            <ShieldCheck className="h-3 w-3" />
            Compliance
          </span>
          <p className="truncate text-sm font-semibold text-gray-900">{audit.comp_employee_name || '—'}</p>
        </div>
        <Badge variant={statusVariant(audit.status)}>{audit.status}</Badge>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-gray-600">
        <span className="truncate">Branch: {audit.branch_name || '—'}</span>
        <span className="shrink-0">{formatDateTime(audit.created_at)}</span>
      </div>
      <div className="mt-1 text-xs text-gray-500">
        <span className="truncate">Company: {audit.company?.name || '—'}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
        <span>Auditor: {audit.auditor_name ?? '—'}</span>
        <span className="font-medium text-gray-700">
          Rate: {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(reward)}
        </span>
      </div>
    </button>
  );
}
