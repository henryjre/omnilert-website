import type { ViolationNotice, ViolationNoticeStatus, ViolationNoticeCategory } from '@omnilert/shared';
import { MessageSquare, MoreHorizontal, Reply } from 'lucide-react';
import { Card } from '@/shared/components/ui/Card';

interface ViolationNoticeCardProps {
  vn: ViolationNotice;
  selected: boolean;
  onSelect: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatStatus(status: ViolationNoticeStatus): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getStatusClasses(status: ViolationNoticeStatus): string {
  switch (status) {
    case 'queued':
      return 'bg-yellow-100 text-yellow-800';
    case 'discussion':
      return 'bg-blue-100 text-blue-800';
    case 'issuance':
      return 'bg-orange-100 text-orange-800';
    case 'disciplinary_meeting':
      return 'bg-purple-100 text-purple-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function formatCategory(category: ViolationNoticeCategory): string {
  switch (category) {
    case 'manual':
      return 'Manual';
    case 'case_reports':
      return 'Case Report';
    case 'store_audits':
      return 'Store Audit';
    default:
      return category;
  }
}

export function ViolationNoticeCard({
  vn,
  selected,
  onSelect,
  onLeave,
  onToggleMute,
}: ViolationNoticeCardProps) {
  const displayedTargets = vn.targets.slice(0, 2);
  const extraTargetCount = vn.targets.length - 2;

  const targetText =
    vn.targets.length === 0
      ? 'No targets'
      : displayedTargets.map((t) => t.user_name ?? 'Unknown').join(', ') +
        (extraTargetCount > 0 ? `, +${extraTargetCount} more` : '');

  return (
    <div
      className={`cursor-pointer rounded-xl transition-shadow hover:shadow-md ${selected ? 'ring-2 ring-primary-500' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <Card className="flex h-full flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-gray-900">
              VN-{String(vn.vn_number).padStart(4, '0')}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClasses(vn.status)}`}
              >
                {formatStatus(vn.status)}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {formatCategory(vn.category)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <details>
                <summary className="list-none rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <MoreHorizontal className="h-4 w-4" />
                </summary>
                <div className="absolute right-0 top-7 z-10 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                  <button
                    type="button"
                    onClick={onLeave}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    Leave Discussion
                  </button>
                  <button
                    type="button"
                    onClick={onToggleMute}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {vn.is_muted ? 'Unmute Discussion' : 'Mute Discussion'}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* Targets */}
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-500">Targets: </span>
          {targetText}
        </div>

        {/* Footer */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
          <p className="truncate">{vn.created_by_name ?? 'Unknown'} • {formatDate(vn.created_at)}</p>
          <div className="flex shrink-0 items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              {vn.message_count}
            </span>
            {vn.is_joined && vn.unread_count > 0 && (
              <span className="rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white">
                +{vn.unread_count}
              </span>
            )}
            {vn.is_joined && vn.unread_reply_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                <Reply className="h-3 w-3" />
                {vn.unread_reply_count}
              </span>
            )}
            {vn.is_joined && <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />}
          </div>
        </div>
      </Card>
    </div>
  );
}
