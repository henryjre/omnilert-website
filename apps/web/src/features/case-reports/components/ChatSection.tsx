import { useRef, useState, useCallback, useEffect, Fragment } from 'react';
import type { CaseMessage, CaseTask } from '@omnilert/shared';
import { Paperclip, Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/shared/components/ui/Button';
import type { MentionableRole, MentionableUser } from '../services/caseReport.api';
import { MentionPicker } from './MentionPicker';
import { ChatMessage } from './ChatMessage';
import { ImagePreviewModal } from './ImagePreviewModal';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';
import { FileThumbnail } from '@/shared/components/ui/FileThumbnail';
import type { Socket } from 'socket.io-client';

function autoResizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 5 * 20 + 16)}px`;
}

interface ChatSectionProps {
  className?: string;
  messages: (CaseMessage & { isPending?: boolean })[];
  currentUserId: string;
  currentUserRoleIds?: string[];
  canManage: boolean;
  chatLocked: boolean;
  isClosed?: boolean;
  closedLabel?: string;
  users: MentionableUser[];
  roles: MentionableRole[];
  onSend: (input: {
    content: string;
    parentMessageId?: string | null;
    mentionedUserIds: string[];
    mentionedRoleIds: string[];
    files: File[];
  }) => Promise<void>;
  initialFlashMessageId?: string | null;
  onFlashMessageConsumed?: () => void;
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onCreateTask?: (message: CaseMessage) => void;
  tasks?: CaseTask[];
  onOpenTask?: (task: CaseTask) => void;
  disableAttachments?: boolean;
  disableReply?: boolean;
  disableReactions?: boolean;
  socket?: Socket | null;
  caseId?: string;
  taskId?: string;
  currentUserName?: string;
}

export function ChatSection({
  className,
  messages,
  currentUserId,
  currentUserRoleIds,
  canManage,
  chatLocked,
  isClosed,
  closedLabel,
  users,
  roles,
  initialFlashMessageId,
  onFlashMessageConsumed,
  onSend,
  onReact,
  onEdit,
  onDelete,
  onCreateTask,
  tasks,
  onOpenTask,
  disableAttachments = false,
  disableReply = false,
  disableReactions = false,
  socket,
  caseId,
  taskId,
  currentUserName,
}: ChatSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const justSentRef = useRef(false);

  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<CaseMessage | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAtIndex, setMentionAtIndex] = useState<number>(-1);
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([]);
  const [mentionedRoleIds, setMentionedRoleIds] = useState<string[]>([]);
  const [mentionTokens, setMentionTokens] = useState<{ token: string; color?: string }[]>([]);
  const [previewMedia, setPreviewMedia] = useState<{ items: { url: string; fileName: string }[]; index: number } | null>(null);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const [visibleTimestampMessageId, setVisibleTimestampMessageId] = useState<string | null>(null);
  const initialFlashFiredRef = useRef(false);

  // ── Typing indicators ─────────────────────────────────────────────────────
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const emitTypingStop = useCallback(() => {
    if (!socket || !caseId || !currentUserName || !isTypingRef.current) return;
    isTypingRef.current = false;
    socket.emit('case-report:typing:stop', { caseId, userName: currentUserName, taskId });
  }, [socket, caseId, currentUserName, taskId]);

  const emitTypingStart = useCallback(() => {
    if (!socket || !caseId || !currentUserName) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('case-report:typing', { caseId, userName: currentUserName, taskId });
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(emitTypingStop, 3000);
  }, [socket, caseId, currentUserName, taskId, emitTypingStop]);

  useEffect(() => {
    if (!socket || !caseId) return;
    const onTyping = (payload: { caseId: string; userName: string; taskId?: string }) => {
      if (payload.caseId !== caseId || payload.taskId !== taskId) return;
      setTypingUsers((prev) => prev.includes(payload.userName) ? prev : [...prev, payload.userName]);
    };
    const onTypingStop = (payload: { caseId: string; userName: string; taskId?: string }) => {
      if (payload.caseId !== caseId || payload.taskId !== taskId) return;
      setTypingUsers((prev) => prev.filter((u) => u !== payload.userName));
    };
    socket.on('case-report:typing', onTyping);
    socket.on('case-report:typing:stop', onTypingStop);
    return () => {
      socket.off('case-report:typing', onTyping);
      socket.off('case-report:typing:stop', onTypingStop);
    };
  }, [socket, caseId, taskId]);

  // Stop typing on unmount
  useEffect(() => () => { emitTypingStop(); }, [emitTypingStop]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const end = messagesEndRef.current;
    if (!end) return;
    if (justSentRef.current) {
      justSentRef.current = false;
      end.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (nearBottom) end.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const handleSend = useCallback(async () => {
    if (chatLocked || (!content.trim() && files.length === 0)) return;
    emitTypingStop();
    justSentRef.current = true;
    await onSend({ content, parentMessageId: replyTo?.id ?? null, mentionedUserIds, mentionedRoleIds, files });
    setContent('');
    setFiles([]);
    setReplyTo(null);
    setMentionOpen(false);
    setMentionQuery('');
    setMentionedUserIds([]);
    setMentionedRoleIds([]);
    setMentionTokens([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [chatLocked, content, files, replyTo, mentionedUserIds, mentionedRoleIds, onSend]);

  useEffect(() => {
    if (!initialFlashMessageId || initialFlashFiredRef.current || messages.length === 0) return;
    initialFlashFiredRef.current = true;
    const targetId = initialFlashMessageId;
    setTimeout(() => {
      const el = document.querySelector(`[data-message-id="${targetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setFlashMessageId(targetId);
        setTimeout(() => setFlashMessageId(null), 1200);
      }
      onFlashMessageConsumed?.();
    }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, initialFlashMessageId]);

  useEffect(() => {
    if (!visibleTimestampMessageId) return;

    function handleDocumentPointerDown(e: PointerEvent) {
      if (!(e.target instanceof HTMLElement)) {
        setVisibleTimestampMessageId(null);
        return;
      }

      const bubble = e.target.closest('[data-message-bubble-id]');
      if (!bubble) {
        setVisibleTimestampMessageId(null);
      }
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, [visibleTimestampMessageId]);

  function handleScroll() {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  const renderHighlightedContent = useCallback((text: string, tokens: { token: string; color?: string }[]) => {
    if (tokens.length === 0) return <span>{text}</span>;

    const escaped = tokens.map((t) => t.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escaped.join('|')})`, 'g');
    const parts = text.split(pattern);

    return (
      <>
        {parts.map((part, i) => {
          const match = tokens.find((t) => t.token === part);
          if (match) {
            const bg = match.color ? match.color + '33' : '#dbeafe';
            const fg = match.color ?? '#1d4ed8';
            return (
              <mark key={i} style={{ backgroundColor: bg, color: fg, borderRadius: '3px', padding: '0 2px' }}>
                {part}
              </mark>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </>
    );
  }, []);

  function handleScrollToMessage(messageId: string) {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashMessageId(messageId);
      setTimeout(() => setFlashMessageId(null), 1200);
    }
  }

  return (
    <div className={`flex h-full flex-col${className ? ` ${className}` : ''}`}>
      <div ref={scrollContainerRef} className="flex-1 space-y-0.5 overflow-y-auto">
        {messages.map((message, index) => {
          const prev = index > 0 ? messages[index - 1] : null;
          const next = index < messages.length - 1 ? messages[index + 1] : null;
          const isGrouped =
            !message.is_system &&
            !message.is_deleted &&
            prev !== null &&
            !prev.is_system &&
            prev.user_id === message.user_id &&
            new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() < 10 * 60 * 1000;
          const isFollowedByGrouped =
            !message.is_system &&
            !message.is_deleted &&
            next !== null &&
            !next.is_system &&
            !next.is_deleted &&
            next.user_id === message.user_id &&
            new Date(next.created_at).getTime() - new Date(message.created_at).getTime() < 10 * 60 * 1000;

          const showTopTimestamp =
            !message.is_system &&
            (prev === null ||
              new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() >= 10 * 60 * 1000);

          return (
            <Fragment key={message.id}>
              {showTopTimestamp && (
                <div className="py-3 flex justify-center">
                  <span className="text-[11px] font-semibold text-gray-400">
                    {new Date(message.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
              <ChatMessage
                message={message}
              currentUserId={currentUserId}
              currentUserRoleIds={currentUserRoleIds}
              canManage={canManage}
              chatLocked={chatLocked}
              allMessages={messages}
              users={users}
              roles={roles}
              isGrouped={isGrouped}
              isFollowedByGrouped={isFollowedByGrouped}
              isPending={message.isPending}
              isReplyTarget={replyTo?.id === message.id}
              isFlashing={flashMessageId === message.id}
              isTimestampVisible={visibleTimestampMessageId === message.id}
              onTimestampTap={(messageId) =>
                setVisibleTimestampMessageId((current) =>
                  current === messageId ? current : messageId,
                )
              }
              onReply={disableReply ? () => {} : setReplyTo}
              onReact={(messageId, emoji) => void onReact(messageId, emoji)}
              disableReply={disableReply}
              disableReactions={disableReactions}
              onEdit={onEdit}
              onDelete={onDelete}
              onScrollToMessage={handleScrollToMessage}
              onPreviewImage={(items, index) => setPreviewMedia({ items, index })}
              onCreateTask={onCreateTask}
              tasks={tasks}
              onOpenTask={onOpenTask}
            />
          </Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {isClosed && (
        <p className="mt-4 border-t border-gray-200 pt-4 text-center text-sm italic text-gray-400">
          {closedLabel ?? 'This case has been closed'}
        </p>
      )}

      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            key="typing-indicator"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5 px-1 pb-1 pt-2"
          >
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block h-1.5 w-1.5 rounded-full bg-gray-400"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                />
              ))}
            </span>
            <span className="text-xs text-gray-400">
              {typingUsers.length === 1
                ? `${typingUsers[0]} is typing…`
                : typingUsers.length === 2
                  ? `${typingUsers[0]} and ${typingUsers[1]} are typing…`
                  : 'Several people are typing…'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`relative border-t border-gray-200 pb-[env(safe-area-inset-bottom)] pt-3${isClosed ? ' hidden' : ''}`}>
        <MentionPicker
          isOpen={mentionOpen}
          query={mentionQuery}
          users={users}
          roles={roles}
          onSelectUser={(user) => {
            setMentionedUserIds((current) => Array.from(new Set([...current, user.id])));
            const token = `@${user.name}`;
            setContent((current) =>
              mentionAtIndex >= 0
                ? current.slice(0, mentionAtIndex) + token + ' '
                : current + token + ' ',
            );
            setMentionTokens((t) => [...t, { token }]);
            setMentionOpen(false);
            setMentionAtIndex(-1);
          }}
          onSelectRole={(role) => {
            setMentionedRoleIds((current) => Array.from(new Set([...current, role.id])));
            const token = `@${role.name}`;
            setContent((current) =>
              mentionAtIndex >= 0
                ? current.slice(0, mentionAtIndex) + token + ' '
                : current + token + ' ',
            );
            setMentionTokens((t) => [...t, { token, color: role.color ?? undefined }]);
            setMentionOpen(false);
            setMentionAtIndex(-1);
          }}
        />

        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <span className="truncate">
              Replying to <span className="font-medium">{replyTo.user_name}</span>: {replyTo.content.slice(0, 60)}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="ml-2 shrink-0 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((file) => (
              <FileThumbnail
                key={`${file.name}-${file.size}-${file.lastModified}`}
                file={file}
                onRemove={() => setFiles((current) => current.filter((f) => f !== file))}
              />
            ))}
          </div>
        )}

        {/* WhatsApp-style single-row composer */}
        <motion.div
          layout
          className="flex items-end gap-1 rounded-2xl border border-gray-200 bg-white px-2 py-1.5 shadow-[0_-1px_0_0_rgba(0,0,0,0.04)]"
        >
          {!disableAttachments && (
            <motion.button
              layout
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={chatLocked}
              className="mb-0.5 shrink-0 rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
              title="Attach file"
            >
              <Paperclip className="h-5 w-5" />
            </motion.button>
          )}

          <motion.div layout className="relative min-w-0 flex-1">
            {/* Highlight overlay — sits behind the transparent textarea */}
            <div
              ref={overlayRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-2 py-2 text-sm"
              style={{ fontFamily: 'inherit', lineHeight: '1.25rem', fontSize: '16px', wordBreak: 'break-word' }}
            >
              {renderHighlightedContent(content, mentionTokens)}
              {'​'}
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onPaste={async (e) => {
                const items = Array.from(e.clipboardData.items);
                const imageItems = items.filter((item) => item.type.startsWith('image/'));
                if (imageItems.length === 0) return;

                const newFiles: File[] = [];
                for (const item of imageItems) {
                  const blob = item.getAsFile();
                  if (blob) {
                    const extension = item.type.split('/')[1] || 'png';
                    const file = new File([blob], `pasted-image-${Date.now()}.${extension}`, { type: item.type });
                    newFiles.push(await normalizeFileForUpload(file));
                  }
                }

                if (newFiles.length > 0) {
                  setFiles((current) => [...current, ...newFiles]);
                }
              }}
              onChange={(event) => {
                const next = event.target.value;
                setContent(next);
                autoResizeTextarea(event.target);
                if (next.trim()) emitTypingStart(); else emitTypingStop();
                const cursor = event.target.selectionStart ?? next.length;
                const before = next.slice(0, cursor);
                const atIdx = before.lastIndexOf('@');
                const afterAt = before.slice(atIdx + 1);
                if (atIdx >= 0 && !afterAt.includes(' ')) {
                  setMentionQuery(afterAt);
                  setMentionAtIndex(atIdx);
                  setMentionOpen(true);
                } else {
                  setMentionOpen(false);
                  setMentionAtIndex(-1);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              onScroll={handleScroll}
              rows={1}
              disabled={chatLocked}
              className="w-full resize-none bg-transparent px-2 py-2 text-sm outline-none disabled:opacity-50"
              style={{
                lineHeight: '1.25rem',
                fontSize: '16px',
                ...(content ? { caretColor: 'black', color: 'transparent', WebkitTextFillColor: 'transparent' } : {}),
              }}
              placeholder={chatLocked ? 'Chat is locked' : 'Write a message...'}
            />
          </motion.div>

          <motion.div layout>
            <Button
              onClick={() => void handleSend()}
              disabled={chatLocked || (!content.trim() && files.length === 0)}
              className="mb-1.5 shrink-0 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </motion.div>
        </motion.div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          disabled={disableAttachments}
          className="hidden"
          onChange={async (event) => {
            const raw = Array.from(event.target.files ?? []);
            const normalized = await Promise.all(raw.map(normalizeFileForUpload));
            setFiles((current) => [...current, ...normalized]);
            event.target.value = '';
          }}
        />
      </div>

      <ImagePreviewModal
        items={previewMedia?.items ?? null}
        index={previewMedia?.index ?? 0}
        onIndexChange={(i) => setPreviewMedia((prev) => prev ? { ...prev, index: i } : null)}
        onClose={() => setPreviewMedia(null)}
      />
    </div>
  );
}
