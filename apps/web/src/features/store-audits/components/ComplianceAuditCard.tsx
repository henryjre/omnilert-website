import type { StoreAudit } from '@omnilert/shared';
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
        <p className="text-sm font-semibold text-gray-900">{audit.comp_employee_name || 'Compliance Audit'}</p>
        <Badge variant={statusVariant(audit.status)}>{audit.status}</Badge>
      </div>
      <p className="mt-1 text-xs text-gray-600">Check-in: {formatDateTime(audit.comp_check_in_time)}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-700">
        <span>Employee ID: {audit.comp_odoo_employee_id ?? '—'}</span>
        <span>
          Reward: {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(reward)}
        </span>
      </div>
    </button>
  );
}
