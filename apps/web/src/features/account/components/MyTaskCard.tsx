import { ChevronRight, FileWarning } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import type { MyTask } from '@/features/case-reports/services/caseReport.api';

interface MyTaskCardProps {
  task: MyTask;
  completed: boolean;
  onClick: () => void;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MyTaskCard({ task, completed, onClick }: MyTaskCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-gray-900 transition-colors group-hover:text-primary-700">
            {task.description}
          </p>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500">
            <FileWarning className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Case #{String(task.case_number).padStart(4, '0')} - {task.case_title}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {task.last_message_at ? `Last activity ${formatDate(task.last_message_at)}` : `Created ${formatDate(task.created_at)}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Badge variant={completed ? 'success' : 'warning'}>
            {completed ? 'Completed' : 'Pending'}
          </Badge>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}
