import type { CaseTask, CaseTaskAssignee } from '@omnilert/shared';
import { CheckCircle2, Circle, ClipboardList } from 'lucide-react';

// ── Avatar helpers ─────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

function getAvatarColor(name: string): string {
  const hue = hashName(name) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function AssigneeAvatar({ assignee, size = 'sm' }: { assignee: CaseTaskAssignee; size?: 'sm' | 'xs' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-5 w-5 text-[9px]';
  const name = assignee.user_name ?? '?';
  if (assignee.user_avatar) {
    return (
      <img
        src={assignee.user_avatar}
        alt={name}
        className={`${dim} rounded-full object-cover ring-2 ring-white`}
      />
    );
  }
  return (
    <div
      className={`${dim} flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-white`}
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {getInitials(name)}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface TaskListProps {
  tasks: CaseTask[];
  currentUserId: string;
  canManage: boolean;
  onTaskClick: (task: CaseTask) => void;
  onComplete: (taskId: string, userId: string) => Promise<void>;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TaskList({ tasks, currentUserId, canManage, onTaskClick, onComplete }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
        <ClipboardList className="h-10 w-10 opacity-40" />
        <p className="text-sm">No tasks yet</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {tasks.map((task) => {
        const doneCount = task.assignees.filter((a) => a.completed_at).length;
        const total = task.assignees.length;
        const allDone = doneCount === total && total > 0;
        const visibleAssignees = task.assignees.slice(0, 3);
        const overflow = task.assignees.length - 3;

        // Only the task creator can mark assignees as done
        const completableAssignees = task.created_by === currentUserId
          ? task.assignees.filter((a) => !a.completed_at)
          : [];

        return (
          <div
            key={task.id}
            className="group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
            onClick={() => onTaskClick(task)}
          >
            {/* Stacked avatars */}
            <div className="mt-0.5 flex shrink-0 -space-x-2">
              {visibleAssignees.map((a) => (
                <AssigneeAvatar key={a.id} assignee={a} size="sm" />
              ))}
              {overflow > 0 && (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600 ring-2 ring-white">
                  +{overflow}
                </div>
              )}
            </div>

            {/* Description + progress */}
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-medium ${allDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                {task.description}
              </p>
              {total > 1 && (
                <div className="mt-1 flex items-center gap-1.5">
                  {task.assignees.map((a) => (
                    <span
                      key={a.id}
                      title={`${a.user_name ?? 'Unknown'}: ${a.completed_at ? 'Done' : 'Pending'}`}
                      className={`h-1.5 w-1.5 rounded-full ${a.completed_at ? 'bg-green-500' : 'bg-gray-300'}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Status badge */}
            <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {allDone ? (
                <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  <CheckCircle2 className="h-3 w-3" />
                  Done
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {doneCount}/{total} done
                </span>
              )}

              {/* Quick complete button — shown for completable assignees */}
              {completableAssignees.length > 0 && !allDone && (
                <button
                  type="button"
                  title="Mark as done"
                  onClick={async (e) => {
                    e.stopPropagation();
                    // If current user is an assignee, complete for self first; else use first completable
                    const selfAssignee = completableAssignees.find((a) => a.user_id === currentUserId);
                    const target = selfAssignee ?? completableAssignees[0];
                    await onComplete(task.id, target.user_id);
                  }}
                  className="rounded-full p-1 text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors"
                >
                  <Circle className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
