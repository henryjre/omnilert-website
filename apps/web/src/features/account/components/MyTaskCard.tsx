import { ChevronRight, FileWarning } from 'lucide-react';
import type { MyTask } from '@/features/case-reports/services/caseReport.api';

interface MyTaskCardProps {
  task: MyTask;
  onClick: () => void;
}

export function MyTaskCard({ task, onClick }: MyTaskCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-shadow hover:shadow-sm active:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-gray-900">
          {task.description}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
          <FileWarning className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            Case #{String(task.case_number).padStart(4, '0')} - {task.case_title}
          </span>
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
    </button>
  );
}
