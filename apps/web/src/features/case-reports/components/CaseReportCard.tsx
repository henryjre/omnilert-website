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
  return new Date(value).toLocaleString();
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Case {String(report.case_number).padStart(4, '0')}
            </p>
            <h3 className="mt-1 truncate font-semibold text-gray-900">{report.title}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
        <p className="line-clamp-3 text-sm leading-6 text-gray-600">
          {report.description.slice(0, 500)}
        </p>

        {/* Footer */}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
          <p className="truncate">{report.created_by_name ?? 'Unknown'} • {formatDate(report.created_at)}</p>
          <div className="flex shrink-0 items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              {report.message_count}
            </span>
            {report.is_joined && report.unread_count > 0 && (
              <span className="rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white">
                +{report.unread_count}
              </span>
            )}
            {report.is_joined && report.unread_reply_count > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                <Reply className="h-3 w-3" />
                {report.unread_reply_count}
              </span>
            )}
            {report.is_joined && <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />}
          </div>
        </div>
      </Card>
    </div>
  );
}
