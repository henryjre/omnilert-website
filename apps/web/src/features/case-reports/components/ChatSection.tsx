import { useRef, useState, useCallback, useEffect } from 'react';
import type { CaseMessage } from '@omnilert/shared';
import { AtSign, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import type { MentionableRole, MentionableUser } from '../services/caseReport.api';
import { MentionPicker } from './MentionPicker';
import { ChatMessage } from './ChatMessage';
import { ImagePreviewModal } from './ImagePreviewModal';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';

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
}

import { FileThumbnail } from '@/shared/components/ui/FileThumbnail';

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
  // Track inserted mentions for highlight: { token: string; color?: string }[]
  const [mentionTokens, setMentionTokens] = useState<{ token: string; color?: string }[]>([]);
  const [previewMedia, setPreviewMedia] = useState<{ items: { url: string; fileName: string }[]; index: number } | null>(null);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const initialFlashFiredRef = useRef(false);

  // Auto-scroll to bottom when messages change:
  // - always on initial load
  // - always after the user sends a message
  // - when already near the bottom (within 120px)
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

  // Focus the textarea whenever a reply is set
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  const handleSend = useCallback(async () => {
    if (chatLocked || (!content.trim() && files.length === 0)) return;
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
  }, [chatLocked, content, files, replyTo, mentionedUserIds, mentionedRoleIds, onSend]);

  // When messages load and an initialFlashMessageId is set, scroll + flash to it once
  useEffect(() => {
    if (!initialFlashMessageId || initialFlashFiredRef.current || messages.length === 0) return;
    initialFlashFiredRef.current = true;
    const targetId = initialFlashMessageId;
    // Give the DOM a tick to render messages before scrolling
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

  // Sync overlay scroll with textarea scroll
  function handleScroll() {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  // Build highlighted JSX from content + known mention tokens
  const renderHighlightedContent = useCallback((text: string, tokens: { token: string; color?: string }[]) => {
    if (tokens.length === 0) return <span>{text}</span>;

    // Build a regex that matches any known mention token
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
      <div ref={scrollContainerRef} className="flex-1 space-y-1 overflow-y-auto pr-1">
        {messages.map((message, index) => {
          const prev = index > 0 ? messages[index - 1] : null;
          const isGrouped =
            !message.is_system &&
            !message.is_deleted &&
            prev !== null &&
            !prev.is_system &&
            prev.user_id === message.user_id &&
            new Date(message.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;

          return (
            <ChatMessage
              key={message.id}
              message={message}
              currentUserId={currentUserId}
              currentUserRoleIds={currentUserRoleIds}
              canManage={canManage}
              chatLocked={chatLocked}
              allMessages={messages}
              users={users}
              roles={roles}
              isGrouped={isGrouped}
              isPending={message.isPending}
              isReplyTarget={replyTo?.id === message.id}
              isFlashing={flashMessageId === message.id}
              onReply={setReplyTo}
              onReact={(messageId, emoji) => void onReact(messageId, emoji)}
              onEdit={onEdit}
              onDelete={onDelete}
              onScrollToMessage={handleScrollToMessage}
              onPreviewImage={(items, index) => setPreviewMedia({ items, index })}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {isClosed && (
        <p className="mt-4 border-t border-gray-200 pt-4 text-center text-sm italic text-gray-400">
          {closedLabel ?? 'This case has been closed'}
        </p>
      )}

      <div className={`relative mt-4 border-t border-gray-200 pb-[env(safe-area-inset-bottom)] pt-4${isClosed ? ' hidden' : ''}`}>
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
          <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
            <span>Replying to {replyTo.user_name}: {replyTo.content.slice(0, 60)}</span>
            <button type="button" onClick={() => setReplyTo(null)}><X className="h-4 w-4" /></button>
          </div>
        )}
        {files.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {files.map((file) => (
              <FileThumbnail
                key={`${file.name}-${file.size}-${file.lastModified}`}
                file={file}
                onRemove={() => setFiles((current) => current.filter((f) => f !== file))}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="relative min-h-[48px] flex-1 sm:min-h-[96px]">
            {/* Highlight overlay — sits behind the transparent textarea */}
            <div
              ref={overlayRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm sm:py-3"
              style={{ fontFamily: 'inherit', lineHeight: 'inherit', wordBreak: 'break-word' }}
            >
              {renderHighlightedContent(content, mentionTokens)}
              {/* Trailing space to keep height stable */}
              {'\u200b'}
            </div>
            <textarea
              ref={textareaRef}
              value={content}
              onPaste={async (e) => {
                const items = Array.from(e.clipboardData.items);
                const imageItems = items.filter((item) => item.type.startsWith('image/'));
                if (imageItems.length === 0) return;

                // Stop default paste (which might paste text if both are present, or do nothing)
                // Actually, if we just want to ADD the image and let text paste normally, we don't preventDefault.
                // But usually, when you paste an image, you don't want the raw binary bits as text.
                
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
                  setFiles((prev) => [...prev, ...newFiles]);
                }
              }}
              onChange={(event) => {
                const next = event.target.value;
                setContent(next);
                // Find the last @ that has no space after it (active mention)
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
                // Enter sends on desktop; Shift+Enter inserts newline; mobile never triggers this path
                if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              onScroll={handleScroll}
              rows={2}
              disabled={chatLocked}
              className="relative min-h-[48px] w-full rounded-2xl border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 sm:min-h-[96px] sm:py-3"
              style={content ? { caretColor: 'black', color: 'transparent', WebkitTextFillColor: 'transparent' } : {}}
              placeholder={chatLocked ? 'Chat is locked for this case' : 'Write a message...'}
            />
          </div>
          <div className="flex flex-row gap-2 self-end sm:flex-col">
            <Button variant="secondary" onClick={() => setMentionOpen((current) => !current)} disabled={chatLocked}>
              <AtSign className="h-4 w-4" />
            </Button>
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={chatLocked}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => void handleSend()}
              disabled={chatLocked || (!content.trim() && files.length === 0)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={async (event) => {
            const raw = Array.from(event.target.files ?? []);
            const normalized = await Promise.all(raw.map(normalizeFileForUpload));
            setFiles((current) => [...current, ...normalized]);
            event.target.value = ''; // Reset to allow same file selection
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
