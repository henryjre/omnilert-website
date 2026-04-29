import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { CaseMessage, CaseTask, CaseTaskAssignee, CaseTaskMessage } from '@omnilert/shared';
import type { MentionableUser, MentionableRole } from '../services/caseReport.api';
import { ArrowLeft, CheckCircle2, CheckSquare, Circle, ExternalLink } from 'lucide-react';
import { Spinner } from '@/shared/components/ui/Spinner';
import { ChatSection } from './ChatSection';

// ── Avatar helpers ────────────────────────────────────────────────────────────

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

function Avatar({
  name,
  avatarUrl,
  size = 'md',
}: {
  name: string;
  avatarUrl: string | null | undefined;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${dim} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {getInitials(name)}
    </div>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Assignee row ─────────────────────────────────────────────────────────────

function AssigneeRow({
  assignee,
  currentUserId,
  isCreator,
  completing,
  onComplete,
}: {
  assignee: CaseTaskAssignee;
  currentUserId: string;
  isCreator: boolean;
  completing: boolean;
  onComplete: () => void;
}) {
  const isDone = Boolean(assignee.completed_at);
  const canComplete = !isDone && isCreator;
  const name = assignee.user_name ?? 'Unknown';

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <Avatar name={name} avatarUrl={assignee.user_avatar} size="md" />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
          {name}
        </p>
        {isDone && assignee.completed_at && (
          <p className="text-xs text-gray-400">
            Done · {formatDate(assignee.completed_at)}
          </p>
        )}
      </div>
      {isDone ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
      ) : canComplete ? (
        <button
          type="button"
          onClick={onComplete}
          disabled={completing}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-2.5 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-50 disabled:cursor-wait disabled:opacity-60"
        >
          {completing ? <Spinner size="sm" /> : <CheckSquare className="h-3.5 w-3.5" />}
          <span>{completing ? 'Marking...' : 'Mark as Done'}</span>
        </button>
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-gray-300" />
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TaskDetailPanelProps {
  task: CaseTask;
  messages: CaseTaskMessage[];
  currentUserId: string;
  currentUserName?: string;
  currentUserRoleIds?: string[];
  canManage: boolean;
  users: MentionableUser[];
  roles: MentionableRole[];
  socket?: import('socket.io-client').Socket | null;
  initialFlashMessageId?: string | null;
  onBack: () => void;
  onComplete: (taskId: string, userId: string) => Promise<void>;
  onSendMessage: (taskId: string, content: string, files?: File[], parentMessageId?: string | null, mentionedUserIds?: string[], mentionedRoleIds?: string[]) => Promise<void>;
  onReact: (taskId: string, messageId: string, emoji: string) => Promise<void>;
  onJumpToMessage: (messageId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TaskDetailPanel({
  task,
  messages,
  currentUserId,
  currentUserName,
  currentUserRoleIds,
  canManage,
  users,
  roles,
  socket,
  initialFlashMessageId,
  onBack,
  onComplete,
  onSendMessage,
  onReact,
  onJumpToMessage,
}: TaskDetailPanelProps) {
  const [completingUserId, setCompletingUserId] = useState<string | null>(null);

  const allDone =
    task.assignees.length > 0 && task.assignees.every((a) => a.completed_at);

  // Adapt CaseTaskMessage[] → CaseMessage[] so ChatSection can render them
  const adaptedMessages = useMemo((): (CaseMessage & { isPending?: boolean })[] =>
    messages.map((msg) => ({
      id: msg.id,
      case_id: task.case_id,
      user_id: msg.user_id ?? '',
      user_name: msg.user_name ?? undefined,
      user_avatar: msg.user_avatar ?? undefined,
      content: msg.content ?? '',
      is_system: false,
      is_deleted: false,
      is_edited: false,
      parent_message_id: msg.parent_message_id ?? null,
      reactions: msg.reactions ?? [],
      attachments: msg.file_url
        ? [{
            id: msg.id,
            message_id: msg.id,
            file_url: msg.file_url,
            file_name: msg.file_name ?? 'attachment',
            file_size: msg.file_size ?? 0,
            content_type: msg.content_type ?? 'application/octet-stream',
            created_at: msg.created_at,
          }]
        : [],
      mentions: (msg.mentions ?? []).map((m) => ({
        id: m.id,
        message_id: m.message_id,
        mentioned_user_id: m.mentioned_user_id ?? null,
        mentioned_role_id: m.mentioned_role_id ?? null,
        mentioned_name: m.mentioned_name ?? undefined,
      })),
      created_at: msg.created_at,
    })),
  [messages, task.case_id]);

  async function handleComplete(userId: string) {
    if (completingUserId) return;
    setCompletingUserId(userId);
    try {
      await onComplete(task.id, userId);
    } finally {
      setCompletingUserId(null);
    }
  }

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="absolute inset-0 z-20 flex flex-col bg-white"
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="mt-0.5 shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words py-1 text-sm font-semibold leading-5 text-gray-900">
          {task.description}
        </p>
        {allDone ? (
          <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-green-500" />
        ) : (
          <span className="mt-1 shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            In Progress
          </span>
        )}
      </div>

      {/* Scrollable body + chat */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Source message block */}
        {task.source_message_id && task.source_message_content && (
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              From message
            </p>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
              {task.source_message_user_name && (
                <p className="mb-1 text-xs font-semibold text-gray-500">
                  {task.source_message_user_name}
                </p>
              )}
              <p className="line-clamp-3 text-sm text-gray-700">{task.source_message_content}</p>
              <button
                type="button"
                onClick={() => onJumpToMessage(task.source_message_id!)}
                className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Jump to message
              </button>
            </div>
          </div>
        )}

        {/* Assignees */}
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Assignees
          </p>
          <div className="divide-y divide-gray-50">
            {task.assignees.map((assignee) => (
              <AssigneeRow
                key={assignee.id}
                assignee={assignee}
                currentUserId={currentUserId}
                isCreator={task.created_by === currentUserId}
                completing={completingUserId === assignee.user_id}
                onComplete={() => void handleComplete(assignee.user_id)}
              />
            ))}
          </div>
        </div>

        <ChatSection
          className="min-h-0 flex-1 px-4 py-2"
          messages={adaptedMessages}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          currentUserRoleIds={currentUserRoleIds}
          canManage={canManage}
          chatLocked={false}
          users={users}
          roles={roles}
          socket={socket}
          caseId={task.case_id}
          taskId={task.id}
          initialFlashMessageId={initialFlashMessageId}
          onSend={async ({ content, parentMessageId, mentionedUserIds, mentionedRoleIds, files }) => {
            await onSendMessage(task.id, content ?? '', files, parentMessageId, mentionedUserIds, mentionedRoleIds);
          }}
          onReact={async (messageId, emoji) => {
            await onReact(task.id, messageId, emoji);
          }}
          onEdit={async () => {}}
          onDelete={async () => {}}
        />
      </div>
    </motion.div>
  );
}
