import type { ViolationNotice, ViolationNoticeStatus, ViolationNoticeCategory } from '@omnilert/shared';
import { ChevronRight, GitBranch, MessageSquare, Reply } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';

interface ViolationNoticeCardProps {
  vn: ViolationNotice;
  selected: boolean;
  onSelect: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
}

function formatDate(value: string) {
  const d = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: diffDays > 365 ? 'numeric' : undefined });
}

function getStatusVariant(status: ViolationNoticeStatus): 'success' | 'danger' | 'warning' | 'default' {
  switch (status) {
    case 'queued': return 'warning';
    case 'discussion': return 'default';
    case 'issuance': return 'warning';
    case 'disciplinary_meeting': return 'default';
    case 'completed': return 'success';
    case 'rejected': return 'danger';
    default: return 'default';
  }
}

function formatStatus(status: ViolationNoticeStatus): string {
  return status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatCategory(category: ViolationNoticeCategory): string {
  switch (category) {
    case 'manual': return 'Manual';
    case 'case_reports': return 'Case Report';
    case 'store_audits': return 'Store Audit';
    case 'aic_variance': return 'AIC Variance';
    default: return category;
  }
}

export function ViolationNoticeCard({ vn, selected, onSelect }: ViolationNoticeCardProps) {
  const displayedTargets = vn.targets.slice(0, 2);
  const extraTargetCount = vn.targets.length - 2;
  const targetText =
    vn.targets.length === 0
      ? 'No targets'
      : displayedTargets.map((t) => t.user_name ?? 'Unknown').join(', ') +
        (extraTargetCount > 0 ? `, +${extraTargetCount} more` : '');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-full w-full flex-col rounded-xl border bg-white p-4 text-left transition-shadow hover:shadow-md ${
        selected ? 'border-primary-400 ring-2 ring-primary-200' : 'border-gray-200'
      }`}
    >
      {/* Top: VN number + status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            VN-{String(vn.vn_number).padStart(4, '0')}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant={getStatusVariant(vn.status)}>{formatStatus(vn.status)}</Badge>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
              {formatCategory(vn.category)}
            </span>
          </div>
        </div>
      </div>

      {/* Targets */}
      <div className="mt-1.5 min-w-0 space-y-0.5">
        <p className="truncate text-xs text-gray-500">
          <span className="font-medium">Targets: </span>
          {targetText}
        </p>
        {vn.created_by_name && (
          <p className="truncate text-xs text-gray-400">By {vn.created_by_name}</p>
        )}
        {vn.branch_name && (
          <p className="flex items-center gap-1 truncate text-xs text-primary-600">
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{vn.branch_name}</span>
          </p>
        )}
      </div>

      <div className="flex-1" />

      {/* Footer: date · unread + messages + chevron */}
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
          {vn.is_joined && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />}
          <span className="shrink-0">{formatDate(vn.created_at)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
            <MessageSquare className="h-3.5 w-3.5" />
            {vn.message_count}
          </span>
          {vn.is_joined && vn.unread_count > 0 && (
            <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-xs font-semibold text-white">
              +{vn.unread_count}
            </span>
          )}
          {vn.is_joined && vn.unread_reply_count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">
              <Reply className="h-3 w-3" />
              {vn.unread_reply_count}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </button>
  );
}
