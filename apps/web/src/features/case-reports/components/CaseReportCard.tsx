import type { CaseReport } from '@omnilert/shared';
import { MessageSquare, MoreHorizontal, Reply } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Card } from '@/shared/components/ui/Card';

interface CaseReportCardProps {
  report: CaseReport;
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

export function CaseReportCard({
  report,
  selected,
  onSelect,
  onLeave,
  onToggleMute,
}: CaseReportCardProps) {
  return (
    <div
      className={`min-w-0 cursor-pointer overflow-hidden rounded-xl transition-shadow hover:shadow-md ${selected ? 'ring-2 ring-primary-500' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <Card className="flex h-full flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Case {String(report.case_number).padStart(4, '0')}
            </p>
            <h3 className="mt-0.5 truncate font-semibold text-gray-900">{report.title}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant={report.status === 'open' ? 'success' : 'danger'}>
              {report.status === 'open' ? 'Open' : 'Closed'}
            </Badge>
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <details>
                <summary className="list-none rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                  <MoreHorizontal className="h-4 w-4" />
                </summary>
                <div className="absolute right-0 top-7 z-10 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-xl">
                  <button type="button" onClick={onLeave} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">
                    Leave Discussion
                  </button>
                  <button type="button" onClick={onToggleMute} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">
                    {report.is_muted ? 'Unmute Discussion' : 'Mute Discussion'}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="line-clamp-2 text-sm leading-5 text-gray-600">
          {report.description}
        </p>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-gray-500">
          <div className="flex min-w-0 items-center gap-1.5 truncate">
            {report.is_joined && <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400" />}
            <span className="truncate">{report.created_by_name ?? 'Unknown'}</span>
            <span className="shrink-0 text-gray-300">·</span>
            <span className="shrink-0">{formatDate(report.created_at)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              {report.message_count}
            </span>
            {report.is_joined && report.unread_count > 0 && (
              <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                +{report.unread_count}
              </span>
            )}
            {report.is_joined && report.unread_reply_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                <Reply className="h-3 w-3" />
                {report.unread_reply_count}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
