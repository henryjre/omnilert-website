import { ChevronRight } from 'lucide-react';
import type { UnifiedMyTask } from '@omnilert/shared';
import { Badge } from '@/shared/components/ui/Badge';
import { TASK_SOURCE_CONFIG } from '../config/taskSourceConfig';

interface MyTaskCardProps {
  task: UnifiedMyTask;
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
  const config = TASK_SOURCE_CONFIG[task.source];
  const Icon = config.icon;

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
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {task.parent_label} - {task.parent_title}
            </span>
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.chipClassName}`}>
              <Icon className="h-3 w-3" />
              {config.label}
            </span>
            <p className="text-xs text-gray-400">
              {task.last_message_at ? `Last activity ${formatDate(task.last_message_at)}` : `Created ${formatDate(task.created_at)}`}
            </p>
          </div>
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
