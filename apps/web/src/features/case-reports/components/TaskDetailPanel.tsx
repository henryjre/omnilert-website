import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { CaseTask, CaseTaskAssignee, CaseTaskMessage } from '@omnilert/shared';
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, Send } from 'lucide-react';
import { Spinner } from '@/shared/components/ui/Spinner';

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

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
  canManage,
  completing,
  onComplete,
}: {
  assignee: CaseTaskAssignee;
  currentUserId: string;
  canManage: boolean;
  completing: boolean;
  onComplete: () => void;
}) {
  const isDone = Boolean(assignee.completed_at);
  const canComplete = !isDone && (assignee.user_id === currentUserId || canManage);
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
          className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-green-50 hover:text-green-600 transition-colors disabled:opacity-50"
          title="Mark done"
        >
          {completing ? <Spinner size="sm" /> : <Circle className="h-4 w-4" />}
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
  canManage: boolean;
  onBack: () => void;
  onComplete: (taskId: string, userId: string) => Promise<void>;
  onSendMessage: (taskId: string, content: string) => Promise<void>;
  onJumpToMessage: (messageId: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TaskDetailPanel({
  task,
  messages,
  currentUserId,
  canManage,
  onBack,
  onComplete,
  onSendMessage,
  onJumpToMessage,
}: TaskDetailPanelProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [completingUserId, setCompletingUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const allDone =
    task.assignees.length > 0 && task.assignees.every((a) => a.completed_at);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function resizeTextarea() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSendMessage(task.id, trimmed);
      setContent('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } finally {
      setSending(false);
    }
  }

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
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
          {task.description}
        </p>
        {allDone ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
        ) : (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            In Progress
          </span>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
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
                canManage={canManage}
                completing={completingUserId === assignee.user_id}
                onComplete={() => void handleComplete(assignee.user_id)}
              />
            ))}
          </div>
        </div>

        {/* Task chat messages */}
        <div className="px-4 py-3">
          {messages.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No messages yet. Start the conversation.</p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                const isOwn = msg.user_id === currentUserId;
                const name = msg.user_name ?? 'Unknown';
                return (
                  <div key={msg.id} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    {!isOwn && <Avatar name={name} avatarUrl={msg.user_avatar} size="sm" />}
                    <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                      {!isOwn && (
                        <p className="mb-0.5 text-xs font-semibold text-gray-500">{name}</p>
                      )}
                      <div
                        className={`rounded-2xl px-3.5 py-2 text-sm leading-6 ${
                          isOwn
                            ? 'rounded-br-[4px] bg-primary-600 text-white'
                            : 'rounded-bl-[4px] bg-gray-200 text-gray-900'
                        }`}
                      >
                        {msg.content}
                      </div>
                      <p className="mt-0.5 text-[10px] text-gray-400">{formatTime(msg.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 px-3 py-2">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-300 bg-white px-3 py-2 focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Message..."
            rows={1}
            className="min-h-0 flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!content.trim() || sending}
            className="shrink-0 rounded-xl bg-primary-600 p-1.5 text-white hover:bg-primary-700 disabled:opacity-40 transition-opacity"
          >
            {sending ? <Spinner size="sm" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
