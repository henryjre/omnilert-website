import { useRef, useState } from 'react';
import { motion, useAnimationControls, useMotionValue, animate } from 'framer-motion';
import type { CaseMessage } from '@omnilert/shared';
import { Download, Reply } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { MessageActionMenu } from './MessageActionMenu';
import { MessageDrawer } from './MessageDrawer';
import type { MentionableUser, MentionableRole } from '../services/caseReport.api';

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

// ── Timestamp formatter ───────────────────────────────────────────────────────

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Tree search ───────────────────────────────────────────────────────────────

function findInTree(messages: CaseMessage[], id: string): CaseMessage | undefined {
  return messages.find((msg) => msg.id === id);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChatMessageProps {
  message: CaseMessage;
  currentUserId: string;
  canManage: boolean;
  chatLocked: boolean;
  allMessages: CaseMessage[];
  onReply: (message: CaseMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  isReplyTarget?: boolean;
  onScrollToMessage: (messageId: string) => void;
  users?: MentionableUser[];
  roles?: MentionableRole[];
  onPreviewImage?: (url: string, fileName: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatMessage({
  message,
  currentUserId,
  canManage,
  chatLocked,
  allMessages,
  onReply,
  onReact,
  onEdit,
  onDelete,
  isReplyTarget,
  onScrollToMessage,
  users,
  roles,
  onPreviewImage,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // ── Portal trigger rects ──────────────────────────────────────────────────

  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [emojiTriggerRect, setEmojiTriggerRect] = useState<DOMRect | null>(null);
  const [menuTriggerRect, setMenuTriggerRect] = useState<DOMRect | null>(null);

  // ── Long press state ──────────────────────────────────────────────────────

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const pressControls = useAnimationControls();

  // ── Swipe-to-reply state ──────────────────────────────────────────────────

  const swipeX = useMotionValue(0);
  const [swipeProgress, setSwipeProgress] = useState(0); // 0–1 for reply icon opacity
  const touchStartRef = useRef<{ x: number; y: number; locked: 'h' | 'v' | null } | null>(null);

  // ── Long press handlers ───────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    // Start subtle scale-up at 150ms as visual feedback
    highlightTimer.current = setTimeout(() => {
      setIsLongPressing(true);
      void pressControls.start({ scale: 1.03, backgroundColor: '#f3f4f6', transition: { duration: 0.2 } });
    }, 150);
    // Open drawer and bounce back at 500ms
    longPressTimer.current = setTimeout(() => {
      setDrawerOpen(true);
      setIsLongPressing(false);
      void pressControls.start({ scale: 1, backgroundColor: '#ffffff', transition: { type: 'spring', stiffness: 400, damping: 20 } });
    }, 500);
  }

  function handlePointerUp() {
    if (highlightTimer.current) { clearTimeout(highlightTimer.current); highlightTimer.current = null; }
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    setIsLongPressing(false);
    void pressControls.start({ scale: 1, backgroundColor: '#ffffff', transition: { duration: 0.15 } });
  }

  function handlePointerCancel() {
    if (highlightTimer.current) { clearTimeout(highlightTimer.current); highlightTimer.current = null; }
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    setIsLongPressing(false);
    void pressControls.start({ scale: 1, backgroundColor: '#ffffff', transition: { duration: 0.15 } });
  }

  // ── Touch / swipe handlers ────────────────────────────────────────────────

  function handleTouchStart(e: React.TouchEvent) {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      locked: null,
    };
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const start = touchStartRef.current;
    const touch = e.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (start.locked === null && Math.abs(deltaX) + Math.abs(deltaY) > 10) {
      start.locked = Math.abs(deltaX) >= Math.abs(deltaY) ? 'h' : 'v';
      touchStartRef.current = { ...start };
    }

    if (start.locked === 'v') return;

    if (start.locked === 'h' && deltaX < 0) {
      e.preventDefault();
      const clamped = Math.max(deltaX, -80);
      swipeX.set(clamped);
      setSwipeProgress(Math.min(1, Math.abs(clamped) / 60));
      // Cancel long-press when swiping
      if (highlightTimer.current) { clearTimeout(highlightTimer.current); highlightTimer.current = null; }
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      setIsLongPressing(false);
    }
  }

  function handleTouchEnd() {
    if (swipeX.get() < -60) onReply(message);
    setSwipeProgress(0);
    void animate(swipeX, 0, { type: 'spring', stiffness: 400, damping: 30 });
    touchStartRef.current = null;
  }

  // ── Delete handler ────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!window.confirm('Delete this message?')) return;
    await onDelete(message.id);
  }

  // ── Mention rendering ─────────────────────────────────────────────────────

  function renderContent(text: string): React.ReactNode {
    if (!users && !roles) return text;

    const mentionNames = new Set<string>();
    for (const m of message.mentions) {
      if (m.mentioned_user_id) {
        const u = users?.find((u) => u.id === m.mentioned_user_id);
        if (u) mentionNames.add(u.name);
      }
      if (m.mentioned_role_id) {
        const r = roles?.find((r) => r.id === m.mentioned_role_id);
        if (r) mentionNames.add(r.name);
      }
    }

    if (mentionNames.size === 0) return text;

    const pattern = new RegExp(
      `(@(?:${Array.from(mentionNames)
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|')}))`,
      'g',
    );
    const parts = text.split(pattern);

    return parts.map((part, i) => {
      if (!part.startsWith('@')) return <span key={i}>{part}</span>;
      const name = part.slice(1);
      const matchedUser = users?.find((u) => u.name === name);
      const matchedRole = roles?.find((r) => r.name === name);

      if (matchedRole) {
        const color = matchedRole.color ?? undefined;
        return (
          <span
            key={i}
            className="rounded px-1 font-medium"
            style={{ backgroundColor: color ? color + '20' : undefined, color }}
          >
            {part}
          </span>
        );
      }
      if (matchedUser) {
        return (
          <span key={i} className="rounded bg-primary-100 px-1 font-medium text-primary-700">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  // ── System message ────────────────────────────────────────────────────────

  if (message.is_system) {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs italic text-gray-400">
          {message.content}
        </span>
      </div>
    );
  }

  // ── Normal message ────────────────────────────────────────────────────────

  return (
    <div data-message-id={message.id} className="relative overflow-hidden">
      {/* Reply icon revealed by swipe */}
      <div
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
        style={{ opacity: swipeProgress }}
      >
        <Reply className="h-5 w-5" />
      </div>

      {/* Swiping message content */}
      <motion.div
        animate={isReplyTarget ? { backgroundColor: '#eff6ff' } : pressControls}
        initial={{ scale: 1, backgroundColor: '#ffffff' }}
        transition={{ duration: 0.2 }}
        style={{ x: swipeX }}
        className="group relative flex gap-3 rounded-xl py-1 sm:hover:bg-gray-50"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Avatar */}
        <div className="shrink-0">
          {message.user_avatar ? (
            <img
              src={message.user_avatar}
              alt={message.user_name ?? ''}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: getAvatarColor(message.user_name ?? 'User') }}
            >
              {getInitials(message.user_name ?? 'User')}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="min-w-0 flex-1">
          {/* Name + timestamp */}
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-gray-900">{message.user_name ?? 'Unknown'}</span>
            <span className="text-xs text-gray-400">{formatTimestamp(message.created_at)}</span>
            {message.is_edited && (
              <span className="text-xs italic text-gray-400">edited</span>
            )}
          </div>

          {/* Quoted reply block */}
          {message.parent_message_id && (() => {
            const parent = findInTree(allMessages, message.parent_message_id);
            return (
              <div
                className="mt-1 cursor-pointer border-l-2 border-gray-300 pl-2 hover:border-primary-400"
                onClick={() => onScrollToMessage(message.parent_message_id!)}
              >
                <p className="text-xs font-medium text-gray-500">
                  {parent ? (parent.user_name ?? 'Unknown') : 'Unknown'}
                </p>
                <p className="truncate text-xs text-gray-400">
                  {parent ? parent.content : '(message deleted)'}
                </p>
              </div>
            );
          })()}

          {/* Message content or inline edit */}
          {isEditing ? (
            <div className="mt-1">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await onEdit(message.id, editContent);
                    setIsEditing(false);
                  }}
                  disabled={!editContent.trim()}
                  className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {renderContent(message.content)}
            </p>
          )}

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.attachments.map((att) => {
                const isImage =
                  /\.(png|jpe?g|gif|webp|svg)$/i.test(att.file_name) ||
                  att.content_type?.startsWith('image/');

                if (isImage) {
                  return (
                    <img
                      key={att.id}
                      src={att.file_url}
                      alt={att.file_name}
                      className="max-h-[180px] max-w-[240px] cursor-pointer rounded-xl object-cover hover:opacity-90"
                      onClick={() => onPreviewImage?.(att.file_url, att.file_name)}
                    />
                  );
                }

                return (
                  <a
                    key={att.id}
                    href={att.file_url}
                    download={att.file_name}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-primary-700 hover:bg-gray-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {att.file_name}
                  </a>
                );
              })}
            </div>
          )}

          {/* Reaction pills */}
          {message.reactions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.reactions.map((reaction) => {
                const reacted = reaction.users.some((u) => u.id === currentUserId);
                return (
                  <button
                    key={reaction.emoji}
                    type="button"
                    onClick={() => onReact(message.id, reaction.emoji)}
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                      reacted
                        ? 'border-primary-300 bg-primary-50 text-primary-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {reaction.emoji} <span>{reaction.users.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop: smiley + ⋯ button — hover only, never on mobile */}
        {!chatLocked && (
          <div className="absolute right-0 top-1 hidden items-center gap-1 sm:group-hover:flex">
            <div className="relative">
              <button
                ref={emojiTriggerRef}
                type="button"
                onClick={() => {
                  setEmojiTriggerRect(emojiTriggerRef.current?.getBoundingClientRect() ?? null);
                  setEmojiPickerOpen((v) => !v);
                }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Add reaction"
              >
                😊
              </button>
              {emojiPickerOpen && (
                <EmojiPicker
                  onSelect={(emoji) => {
                    onReact(message.id, emoji);
                    setEmojiPickerOpen(false);
                  }}
                  onClose={() => setEmojiPickerOpen(false)}
                  placement="above"
                  portalMode={true}
                  triggerRect={emojiTriggerRect}
                />
              )}
            </div>
            <div className="relative">
              <button
                ref={menuTriggerRef}
                type="button"
                onClick={() => {
                  setMenuTriggerRect(menuTriggerRef.current?.getBoundingClientRect() ?? null);
                  setMenuOpen((v) => !v);
                }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="More actions"
              >
                ⋯
              </button>
              {menuOpen && (
                <MessageActionMenu
                  isOwnMessage={message.user_id === currentUserId}
                  canManage={canManage}
                  chatLocked={chatLocked}
                  onReply={() => onReply(message)}
                  onCopyText={() => { void navigator.clipboard.writeText(message.content); }}
                  onAddReaction={() => { setMenuOpen(false); setEmojiPickerOpen(true); }}
                  onEdit={() => { setEditContent(message.content); setIsEditing(true); }}
                  onDelete={handleDelete}
                  onClose={() => setMenuOpen(false)}
                  portalMode={true}
                  triggerRect={menuTriggerRect}
                />
              )}
            </div>
          </div>
        )}

      </motion.div>

      {/* Mobile drawer — outside the transform div so fixed positioning works correctly */}
      <MessageDrawer
        isOpen={drawerOpen}
        message={message}
        currentUserId={currentUserId}
        canManage={canManage}
        chatLocked={chatLocked}
        userHasReacted={(emoji) =>
          message.reactions.some(
            (r) => r.emoji === emoji && r.users.some((u) => u.id === currentUserId),
          )
        }
        onReact={(emoji) => onReact(message.id, emoji)}
        onReply={() => onReply(message)}
        onCopyText={() => { void navigator.clipboard.writeText(message.content); }}
        onEdit={() => { setEditContent(message.content); setIsEditing(true); }}
        onDelete={handleDelete}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
