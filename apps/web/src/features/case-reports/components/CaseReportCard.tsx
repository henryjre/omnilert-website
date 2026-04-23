import type { CaseReport } from '@omnilert/shared';
import { ChevronRight, GitBranch, MessageSquare, Reply } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';

interface CaseReportCardProps {
  report: CaseReport;
  selected: boolean;
  onSelect: () => void;
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

export function CaseReportCard({ report, selected, onSelect }: CaseReportCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-full w-full min-w-0 flex-col rounded-xl border bg-white p-4 text-left transition-shadow hover:shadow-md ${
        selected ? 'border-primary-400 ring-2 ring-primary-200' : 'border-gray-200'
      }`}
    >
      {/* Top: case number + status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Case {String(report.case_number).padStart(4, '0')}
          </p>
          <h3 className="mt-0.5 line-clamp-2 break-words font-semibold text-gray-900">
            {report.title}
          </h3>
        </div>
        <Badge variant={report.status === 'open' ? 'success' : 'default'}>
          {report.status === 'open' ? 'Open' : 'Closed'}
        </Badge>
      </div>

      {/* Metadata: creator + branch */}
      <div className="mt-1.5 min-w-0 space-y-0.5">
        {report.created_by_name && (
          <p className="truncate text-xs text-gray-500">{report.created_by_name}</p>
        )}
        {report.branch_name && (
          <p className="flex min-w-0 items-center gap-1 truncate text-xs text-primary-600">
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{report.branch_name}</span>
          </p>
        )}
      </div>

      <div className="flex-1" />

      {/* Footer: date left · unread + messages + chevron right */}
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
          {report.is_joined && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />}
          <span className="shrink-0">{formatDate(report.created_at)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
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
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </button>
  );
}
