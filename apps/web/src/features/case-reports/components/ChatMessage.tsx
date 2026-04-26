import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import type { CaseMessage } from '@omnilert/shared';
import { Download, Reply, Paperclip } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { MessageActionMenu } from './MessageActionMenu';
import { MessageDrawer } from './MessageDrawer';
import { MessageReactionBadge } from './MessageReactionBadge';
import { MessageReactionsOverlay } from './MessageReactionsOverlay';
import type { MentionableUser, MentionableRole } from '../services/caseReport.api';
import type { CaseTask } from '@omnilert/shared';

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
  currentUserRoleIds?: string[];
  isGrouped?: boolean;
  isFollowedByGrouped?: boolean;
  isPending?: boolean;
  isReplyTarget?: boolean;
  isFlashing?: boolean;
  isTimestampVisible?: boolean;
  onTimestampTap?: (messageId: string) => void;
  onScrollToMessage: (messageId: string) => void;
  users?: MentionableUser[];
  roles?: MentionableRole[];
  onPreviewImage?: (items: { url: string; fileName: string }[], index: number) => void;
  onCreateTask?: (message: CaseMessage) => void;
  tasks?: CaseTask[];
  onOpenTask?: (task: CaseTask) => void;
  disableReply?: boolean;
  disableReactions?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

// ── Compact time formatter (HH:MM) ────────────────────────────────────────────

function formatCompactTime(value: string): string {
  const date = new Date(value);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

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
  currentUserRoleIds,
  isGrouped = false,
  isFollowedByGrouped = false,
  isPending,
  isReplyTarget,
  isFlashing,
  isTimestampVisible = false,
  onTimestampTap,
  onScrollToMessage,
  users,
  roles,
  onPreviewImage,
  onCreateTask,
  tasks,
  onOpenTask,
  disableReply = false,
  disableReactions = false,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [reactionViewerOpen, setReactionViewerOpen] = useState(false);
  const [reactionViewerMode, setReactionViewerMode] = useState<'desktop' | 'mobile'>('desktop');
  const [pendingReactionEmoji, setPendingReactionEmoji] = useState<string | null>(null);

  // ── Portal trigger rects ──────────────────────────────────────────────────

  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [emojiTriggerRect, setEmojiTriggerRect] = useState<DOMRect | null>(null);
  const [menuTriggerRect, setMenuTriggerRect] = useState<DOMRect | null>(null);

  // ── Long press state ──────────────────────────────────────────────────────

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const didMoveRef = useRef(false);
  const didLongPressRef = useRef(false);

  // ── Swipe-to-reply state ──────────────────────────────────────────────────

  const swipeX = useMotionValue(0);
  const [swipeProgress, setSwipeProgress] = useState(0); // 0–1 for reply icon opacity
  const touchStartRef = useRef<{ x: number; y: number; locked: 'h' | 'v' | null } | null>(null);
  const isOwn = message.user_id === currentUserId;

  // ── Long press handlers ───────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    didMoveRef.current = false;
    didLongPressRef.current = false;
    highlightTimer.current = setTimeout(() => setIsLongPressing(true), 150);
    longPressTimer.current = setTimeout(() => {
      didLongPressRef.current = true;
      setDrawerOpen(true);
      setIsLongPressing(false);
    }, 500);
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (highlightTimer.current) {
      clearTimeout(highlightTimer.current);
      highlightTimer.current = null;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsLongPressing(false);

    if (
      e.pointerType === 'touch' &&
      !didMoveRef.current &&
      !didLongPressRef.current &&
      !shouldIgnoreTimestampToggle(e.target)
    ) {
      onTimestampTap?.(message.id);
    }
  }

  function handlePointerCancel() {
    if (highlightTimer.current) {
      clearTimeout(highlightTimer.current);
      highlightTimer.current = null;
    }
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsLongPressing(false);
    didMoveRef.current = false;
    didLongPressRef.current = false;
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
      didMoveRef.current = true;
    }

    if (start.locked === 'v') return;

    const isSwipeDirectionMatch = isOwn ? deltaX < 0 : deltaX > 0;

    if (start.locked === 'h' && isSwipeDirectionMatch) {
      e.preventDefault();
      const clamped = isOwn ? Math.max(deltaX, -80) : Math.min(deltaX, 80);
      swipeX.set(clamped);
      setSwipeProgress(Math.min(1, Math.abs(clamped) / 60));
      // Cancel long-press when swiping
      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current);
        highlightTimer.current = null;
      }
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      setIsLongPressing(false);
    }
  }

  function handleTouchEnd() {
    const swipeValue = swipeX.get();
    if (!disableReply && ((isOwn && swipeValue < -60) || (!isOwn && swipeValue > 60))) onReply(message);
    setSwipeProgress(0);
    void animate(swipeX, 0, { type: 'spring', stiffness: 400, damping: 30 });
    touchStartRef.current = null;
  }

  function shouldIgnoreTimestampToggle(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;

    const bubble = target.closest('[data-message-bubble-id]');
    if (!bubble) return true;

    return Boolean(
      target.closest(
        'button, a, input, textarea, select, label, [role="button"], [data-no-message-tap]',
      ),
    );
  }

  // ── Delete handler ────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!window.confirm('Delete this message?')) return;
    await onDelete(message.id);
  }

  // ── Mention rendering ─────────────────────────────────────────────────────

  function renderContent(text: string): React.ReactNode {
    const mentionNames = new Set<string>();
    for (const m of message.mentions) {
      if (m.mentioned_name) {
        mentionNames.add(m.mentioned_name);
      } else if (m.mentioned_user_id) {
        const u = users?.find((u) => u.id === m.mentioned_user_id);
        if (u) mentionNames.add(u.name);
      } else if (m.mentioned_role_id) {
        const r = roles?.find((r) => r.id === m.mentioned_role_id);
        if (r) mentionNames.add(r.name);
      }
    }

    if (mentionNames.size === 0) return text;

    const pattern = new RegExp(
      `(@(?:${Array.from(mentionNames)
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .sort((a, b) => b.length - a.length) // Sort by length descending to match longest possible name first
        .join('|')}))`,
      'g',
    );
    const parts = text.split(pattern);

    return parts.map((part, i) => {
      if (!part.startsWith('@')) return <span key={i}>{part}</span>;
      const name = part.slice(1);

      const mentionObj = message.mentions.find((m) => m.mentioned_name === name);
      const matchedUser = users?.find((u) => u.name === name);
      const matchedRole = roles?.find((r) => r.name === name);

      // Priority: Roles first (often have specific colors), then Users
      if (matchedRole || mentionObj?.mentioned_role_id) {
        const roleFromList = roles?.find(
          (r) => r.id === mentionObj?.mentioned_role_id || r.name === name,
        );
        const color = roleFromList?.color ?? undefined;
        const ownMentionStyle = isOwn
          ? { backgroundColor: color ? `${color}33` : 'rgba(255,255,255,0.16)', color: '#fff' }
          : { backgroundColor: color ? `${color}20` : undefined, color };
        return (
          <span
            key={i}
            className="rounded px-1 font-medium"
            style={ownMentionStyle}
          >
            {part}
          </span>
        );
      }
      if (matchedUser || mentionObj?.mentioned_user_id) {
        return (
          <span
            key={i}
            className={
              isOwn
                ? 'rounded bg-white/15 px-1 font-medium text-white'
                : 'rounded bg-primary-100 px-1 font-medium text-primary-700'
            }
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  // ── Mention highlight ─────────────────────────────────────────────────────

  const isMentioned = message.mentions.some(
    (m) =>
      (m.mentioned_user_id && m.mentioned_user_id === currentUserId) ||
      (m.mentioned_role_id && currentUserRoleIds?.includes(m.mentioned_role_id)),
  );
  const showAvatar = !isOwn && !isFollowedByGrouped;
  const showSenderName = !isOwn && !isGrouped && !message.parent_message_id;
  const showBubbleTail = !isFollowedByGrouped;
  const hasReactions = message.reactions.length > 0;
  const bubbleTailClass = showBubbleTail
    ? isOwn
      ? 'rounded-br-[4px]'
      : 'rounded-bl-[4px]'
    : '';

  const mediaItems = message.attachments?.filter((a) => {
    return /\.(png|jpe?g|gif|webp|svg|mp4|webm|ogg|mov)$/i.test(a.file_name) ||
           a.content_type?.startsWith('image/') ||
           a.content_type?.startsWith('video/');
  }) || [];
  
  const fileItems = message.attachments?.filter((a) => !mediaItems.includes(a)) || [];
  const isOnlyMedia = !message.content && mediaItems.length > 0 && fileItems.length === 0;

  const hasText = Boolean(message.content?.trim());
  const hasMedia = mediaItems.length > 0;
  const hasFiles = fileItems.length > 0;

  let copyLabel = 'Copy Text';
  if (!hasText) {
    if (hasMedia) {
      const isVideo = mediaItems.some(
        (m) =>
          /\.(mp4|webm|ogg|mov)$/i.test(m.file_name) || m.content_type?.startsWith('video/'),
      );
      copyLabel = isVideo ? 'View Video' : 'View Image';
    } else if (hasFiles) {
      copyLabel = 'View Attachment';
    }
  }

  const handleCopyAction = () => {
    if (hasText) {
      void navigator.clipboard.writeText(message.content);
    } else if (hasMedia) {
      const mediaMap = mediaItems.map((m) => ({ url: m.file_url, fileName: m.file_name }));
      onPreviewImage?.(mediaMap, 0);
    } else if (hasFiles) {
      window.open(fileItems[0].file_url, '_blank');
    }
  };

  const normalBubbleClass = isOnlyMedia 
    ? 'bg-transparent text-gray-900 border border-transparent'
    : `${isOwn ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-900'} ${bubbleTailClass} px-3.5 py-2`;

  const neutralBubbleClass = `bg-gray-200 text-gray-500 ${bubbleTailClass}`;
  const timestampClass = `w-full overflow-hidden text-[10px] text-gray-400 transition-[max-height,margin,opacity] duration-150 ${
    isTimestampVisible ? 'mt-1 max-h-6 opacity-100' : 'max-h-0 opacity-0'
  } ${isOwn ? 'text-right' : 'text-left'}`;

  function renderAvatar(opacityClass = '') {
    if (message.user_avatar) {
      return (
        <img
          src={message.user_avatar}
          alt={message.user_name ?? ''}
          className={`h-10 w-10 rounded-full object-cover ${opacityClass}`.trim()}
        />
      );
    }

    return (
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white ${opacityClass}`.trim()}
        style={{ backgroundColor: getAvatarColor(message.user_name ?? 'User') }}
      >
        {getInitials(message.user_name ?? 'User')}
      </div>
    );
  }

  function renderDesktopActions() {
    if (chatLocked) return null;

    return (
      <div
        className={`absolute top-1/2 -translate-y-1/2 z-10 hidden items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-focus-within:pointer-events-auto sm:flex sm:group-hover:opacity-100 ${isOwn ? 'right-full mr-2 flex-row-reverse' : 'left-full ml-2 flex-row'} pointer-events-none sm:group-hover:pointer-events-auto whitespace-nowrap`}
      >
        {!disableReactions && (
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
        )}
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
              isOwnMessage={isOwn}
              canManage={canManage}
              chatLocked={chatLocked}
              onReply={() => onReply(message)}
              onCopyText={handleCopyAction}
              copyLabel={copyLabel}
              onAddReaction={() => {
                setMenuOpen(false);
                setEmojiPickerOpen(true);
              }}
              onEdit={() => {
                setEditContent(message.content);
                setIsEditing(true);
              }}
              onDelete={handleDelete}
              onCreateTask={onCreateTask ? () => onCreateTask(message) : undefined}
              onClose={() => setMenuOpen(false)}
              portalMode={true}
              triggerRect={menuTriggerRect}
              disableReply={disableReply}
              disableReactions={disableReactions}
            />
          )}
        </div>
        <span className="mx-1 mt-[1px] text-[11px] font-medium text-gray-400/80">
          {formatCompactTime(message.created_at)}
          {message.is_edited && <span className="ml-[3px] italic">edited</span>}
        </span>
      </div>
    );
  }

  function openReactionViewer() {
    const isMobileViewport =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    setReactionViewerMode(isMobileViewport ? 'mobile' : 'desktop');
    setReactionViewerOpen(true);
  }

  function handleRemoveReaction(emoji: string) {
    if (pendingReactionEmoji === emoji) return;
    setPendingReactionEmoji(emoji);
    onReact(message.id, emoji);
  }

  useEffect(() => {
    if (!pendingReactionEmoji) return;

    const stillHasReaction = message.reactions.some(
      (reaction) =>
        reaction.emoji === pendingReactionEmoji &&
        reaction.users.some((user) => user.id === currentUserId),
    );

    if (!stillHasReaction) {
      setPendingReactionEmoji(null);
    }
  }, [currentUserId, message.reactions, pendingReactionEmoji]);

  useEffect(() => {
    if (!pendingReactionEmoji) return;
    const timeout = setTimeout(() => setPendingReactionEmoji(null), 1500);
    return () => clearTimeout(timeout);
  }, [pendingReactionEmoji]);

  // ── Task bubble ───────────────────────────────────────────────────────────

  const linkedTask = tasks?.find((t) => t.discussion_message_id === message.id);

  if (linkedTask) {
    const doneCount = linkedTask.assignees.filter((a) => a.completed_at).length;
    const totalCount = linkedTask.assignees.length;
    const allDone = totalCount > 0 && doneCount === totalCount;
    const visibleAssignees = linkedTask.assignees.slice(0, 3);
    const overflowAssignees = linkedTask.assignees.length - 3;
    const msgCount = linkedTask.message_count ?? 0;
    const isStale = !linkedTask.last_message_at || (Date.now() - new Date(linkedTask.last_message_at).getTime() > 24 * 60 * 60 * 1000);
    const lastContentRaw = linkedTask.last_message_content?.trim() || (linkedTask.last_message_at ? 'Click to view attachment' : null);
    const isAttachmentFallback = !linkedTask.last_message_content?.trim() && !!linkedTask.last_message_at;
    const lastContent = isStale ? null : lastContentRaw;
    const lastUserName = isStale ? null : linkedTask.last_message_user_name;
    const lastUserAvatar = isStale ? null : linkedTask.last_message_user_avatar;

    return (
      <div data-message-id={message.id} className="flex justify-center py-1">
        <button
          type="button"
          onClick={() => onOpenTask?.(linkedTask)}
          className="group w-full max-w-xs rounded-xl border border-gray-200 bg-white px-3 py-2 text-left shadow-sm transition-shadow hover:shadow-md"
        >
          {/* Top row: icon + label + message count | stacked assignee avatars */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${allDone ? 'bg-green-50 text-green-600' : 'bg-primary-50 text-primary-600'}`}>
                {allDone ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  </svg>
                )}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${allDone ? 'text-green-600' : 'text-primary-600'}`}>Task</span>
              {msgCount > 0 && (
                <span className="text-[10px] font-semibold text-gray-400">
                  · {msgCount} {msgCount === 1 ? 'Message' : 'Messages'} ›
                </span>
              )}
            </div>

            {/* Stacked assignee avatars */}
            {totalCount > 0 && (
              <div className="flex items-center">
                {visibleAssignees.map((a, i) => (
                  a.user_avatar ? (
                    <img
                      key={a.id}
                      src={a.user_avatar}
                      alt={a.user_name ?? ''}
                      title={a.user_name ?? ''}
                      className={`h-6 w-6 rounded-full object-cover ring-2 ring-white ${i > 0 ? '-ml-1.5' : ''}`}
                    />
                  ) : (
                    <div
                      key={a.id}
                      title={a.user_name ?? ''}
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[8px] font-semibold text-white ring-2 ring-white ${i > 0 ? '-ml-1.5' : ''}`}
                      style={{ backgroundColor: getAvatarColor(a.user_name ?? 'User') }}
                    >
                      {getInitials(a.user_name ?? 'U')}
                    </div>
                  )
                ))}
                {overflowAssignees > 0 && (
                  <div className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[8px] font-semibold text-gray-600 ring-2 ring-white">
                    +{overflowAssignees}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <p className="mt-1 truncate text-xs font-semibold text-gray-900">{linkedTask.description}</p>

          {/* Last message preview + progress on same row */}
          <div className="mt-1.5 flex items-center gap-2">
            {isStale ? (
              <p className="min-w-0 flex-1 truncate text-[10px] italic text-gray-400">There are no recent messages in this task</p>
            ) : lastContent ? (
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {lastUserAvatar ? (
                  <img src={lastUserAvatar} alt={lastUserName ?? ''} className="h-4 w-4 shrink-0 rounded-full object-cover" />
                ) : lastUserName ? (
                  <div
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[7px] font-semibold text-white"
                    style={{ backgroundColor: getAvatarColor(lastUserName) }}
                  >
                    {getInitials(lastUserName)}
                  </div>
                ) : null}
                {lastUserName && (
                  <span className="shrink-0 text-[10px] font-semibold text-gray-700">{lastUserName.split(' ')[0]}</span>
                )}
                <p className={`min-w-0 truncate text-[10px] text-gray-500${isAttachmentFallback ? ' italic' : ''}`}>{lastContent}</p>
                {linkedTask.last_message_at && (
                  <span className="shrink-0 text-[10px] text-gray-400">{formatCompactTime(linkedTask.last_message_at)}</span>
                )}
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <span className={`shrink-0 text-[10px] font-medium ${allDone ? 'text-green-600' : 'text-gray-400'}`}>
              {doneCount} / {totalCount} done
            </span>
          </div>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-primary-500'}`}
                style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }}
              />
            </div>
          )}
        </button>
      </div>
    );
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

  // ── Pending message placeholder ───────────────────────────────────────────

  if (isPending && !message.is_deleted) {
    return (
      <div
        data-message-id={message.id}
        className={`flex ${isOwn ? 'justify-end' : 'justify-start gap-2'} py-0.5 opacity-60`}
      >
        {!isOwn &&
          (showAvatar ? (
            <div className={`shrink-0 self-end`}>
              {renderAvatar('opacity-50')}
            </div>
          ) : (
            <div className="w-10 shrink-0" />
          ))}

        <div className={`flex min-w-0 max-w-[75%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {showSenderName && (
            <span className="mb-0.5 text-xs font-semibold text-gray-400">
              {message.user_name ?? 'Unknown'}
            </span>
          )}

          <div className={`w-fit max-w-full rounded-2xl px-4 py-2 ${neutralBubbleClass}`}>
            <div className="flex items-center gap-2">
              <span className="flex items-end gap-[3px] pb-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="block h-1.5 w-1.5 rounded-full bg-gray-400"
                    animate={{ y: [0, -4, 0] }}
                    transition={{
                      duration: 0.6,
                      repeat: Infinity,
                      delay: i * 0.15,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </span>
              <p className="text-sm italic text-gray-400">sending a message...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Deleted message tombstone ─────────────────────────────────────────────

  if (message.is_deleted) {
    return (
      <div
        data-message-id={message.id}
        className={`group flex ${isOwn ? 'justify-end' : 'justify-start gap-2'} py-0.5 ${
          isPending ? 'opacity-60' : ''
        }`}
      >
        {!isOwn &&
          (showAvatar ? (
            <div className={`shrink-0 self-end`}>
              {renderAvatar('opacity-50')}
            </div>
          ) : (
            <div className="w-10 shrink-0" />
          ))}

        <div className={`flex min-w-0 max-w-[75%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {showSenderName && (
            <span className="mb-0.5 text-xs font-semibold text-gray-400">
              {message.user_name ?? 'Unknown'}
            </span>
          )}

          <div className={`w-fit max-w-full rounded-2xl px-4 py-2 italic ${neutralBubbleClass}`}>
            <p className="text-sm text-gray-400">{message.content}</p>
          </div>

          <div className={timestampClass}>{formatTimestamp(message.created_at)}</div>
        </div>
      </div>
    );
  }

  // ── Normal message ────────────────────────────────────────────────────────

  return (
    <div data-message-id={message.id} className="relative overflow-hidden">
      {/* Reply icon revealed by swipe */}
      <div
        className={`pointer-events-none absolute ${isOwn ? 'right-2' : 'left-2'} top-1/2 -translate-y-1/2 text-gray-400`}
        style={{ opacity: swipeProgress }}
      >
        <Reply className="h-5 w-5" />
      </div>

      {/* Swiping message content */}
      <motion.div
        animate={{ x: 0 }}
        style={{ x: swipeX, userSelect: 'none', WebkitUserSelect: 'none' }}
        className={`group relative flex rounded-xl select-none sm:hover:bg-gray-50 ${
          isOwn ? 'justify-end' : 'justify-start gap-2'
        } ${isGrouped ? 'py-px' : 'py-0.5'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {!isOwn &&
          (showAvatar ? (
            <div className={`shrink-0 self-end ${hasReactions ? 'mb-[14px]' : ''}`}>{renderAvatar()}</div>
          ) : (
            <div className="w-10 shrink-0" />
          ))}

        <div className={`relative flex min-w-0 max-w-[75%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
          {renderDesktopActions()}

          {showSenderName && (
            <span className="mb-0.5 text-xs font-semibold text-gray-500">
              {message.user_name ?? 'Unknown'}
            </span>
          )}

          {message.parent_message_id && (() => {
            const parent = findInTree(allMessages, message.parent_message_id);
            if (!parent) return null;

            let replyContextText = '';
            if (isOwn && parent.user_id === currentUserId) {
              replyContextText = 'You replied to yourself';
            } else if (isOwn) {
              replyContextText = `You replied to ${parent.user_name || 'someone'}`;
            } else if (parent.user_id === currentUserId) {
              replyContextText = `${message.user_name || 'Someone'} replied to you`;
            } else {
              replyContextText = `${message.user_name || 'Someone'} replied to ${parent.user_name || 'someone'}`;
            }

            const hasMedia = parent.attachments.length > 0;
            const isImage = hasMedia && /\.(png|jpe?g|gif|webp|svg)$/i.test(parent.attachments[0].file_name);

            return (
              <div className={`mb-[-14px] flex w-full flex-col ${isOwn ? 'items-end' : 'items-start'} ${showSenderName ? 'mt-1' : ''}`} data-no-message-tap>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <svg fill="currentColor" viewBox="0 0 24 24" className="h-[14px] w-[14px] opacity-80">
                    <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
                  </svg>
                  <span>{replyContextText}</span>
                </div>
                <div
                  className={`max-w-[85%] cursor-pointer truncate rounded-2xl bg-gray-100 ${
                    hasMedia ? 'p-1 pb-[18px]' : 'px-3.5 pb-[20px] pt-[8px]'
                  } text-[13px] text-gray-500 transition-colors hover:bg-gray-200`}
                  onClick={() => onScrollToMessage(message.parent_message_id!)}
                >
                  {hasMedia ? (
                    isImage ? (
                      <img src={parent.attachments[0].file_url} className="h-24 w-auto rounded-xl object-contain opacity-70" alt="attachment" />
                    ) : (
                      <span className="px-3 py-1 font-medium">Attachment</span>
                    )
                  ) : (
                    parent.content ? parent.content : <span className="italic">(message deleted)</span>
                  )}
                </div>
              </div>
            );
          })()}

          <div className={`relative z-10 ${isEditing ? 'w-full' : 'w-fit max-w-full'} ${hasReactions ? 'mb-[14px]' : ''}`}>
            <motion.div
              data-message-bubble-id={message.id}
              animate={
                isFlashing
                  ? { scale: 1.02, filter: 'brightness(1.1)' }
                  : isLongPressing
                    ? { scale: 1.03, filter: 'brightness(0.95)' }
                    : { scale: 1, filter: 'brightness(1)' }
              }
              transition={{ duration: 0.2 }}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onContextMenu={(e) => e.preventDefault()}
              className={`relative overflow-hidden rounded-[18px] ${isEditing ? 'w-full' : ''} ${normalBubbleClass}`}
            >
              {/* Overlay for flashing/long-press states */}
              <motion.div
                initial={false}
                animate={{
                  opacity: isFlashing || (isLongPressing && !isFlashing) ? 1 : 0,
                  backgroundColor: isFlashing ? '#fde68a' : 'rgba(0,0,0,0.05)',
                }}
                className="pointer-events-none absolute inset-0 z-0"
              />

              <div className="relative z-10">
                {isEditing ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      autoFocus
                    />
                    <div className="mt-2 flex gap-2">
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
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={`whitespace-pre-wrap text-sm leading-6 ${isOwn ? 'text-white' : 'text-gray-700'}`}>
                    {renderContent(message.content)}
                  </p>
                )}

                {mediaItems.length > 0 && (
                  <div className={`${message.content ? 'mt-2' : ''}`}>
                  {(() => {
                    const renderItem = (att: any, index: number, customClass: string) => {
                      const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(att.file_name) || att.content_type?.startsWith('image/');
                      const mediaMap = mediaItems.map(m => ({ url: m.file_url, fileName: m.file_name }));
                      
                      return (
                        <div 
                          key={att.id} 
                          data-no-message-tap 
                          className={`relative overflow-hidden cursor-pointer ${customClass}`}
                          onClick={() => onPreviewImage?.(mediaMap, index)}
                        >
                          {isImg ? (
                            <img src={att.file_url} className="w-full h-full object-cover select-none" alt="" />
                          ) : (
                            <>
                              <video src={att.file_url} className="w-full h-full object-cover opacity-90 select-none bg-black" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-5 w-5">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </div>
                              </div>
                            </>
                          )}
                          {index === 3 && mediaItems.length > 4 && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center font-bold text-white text-2xl">
                              +{mediaItems.length - 4}
                            </div>
                          )}
                        </div>
                      );
                    };

                    if (mediaItems.length === 1) {
                      return (
                        <div className="flex max-w-[280px]">
                          {renderItem(mediaItems[0], 0, `w-full min-h-[160px] max-h-[300px] ${isOnlyMedia ? 'rounded-[18px]' : 'rounded-xl'} hover:opacity-90`)}
                        </div>
                      );
                    }
                    
                    if (mediaItems.length === 2) {
                      return (
                        <div className={`grid grid-cols-2 gap-0.5 max-w-[280px] ${isOnlyMedia ? 'rounded-[18px]' : 'rounded-xl'} overflow-hidden`}>
                          {renderItem(mediaItems[0], 0, 'aspect-[3/4] hover:opacity-90')}
                          {renderItem(mediaItems[1], 1, 'aspect-[3/4] hover:opacity-90')}
                        </div>
                      );
                    }

                    if (mediaItems.length === 3) {
                      return (
                        <div className={`grid grid-cols-2 gap-0.5 max-w-[280px] ${isOnlyMedia ? 'rounded-[18px]' : 'rounded-xl'} overflow-hidden`}>
                          {renderItem(mediaItems[0], 0, 'col-span-2 aspect-[2/1] hover:opacity-90')}
                          {renderItem(mediaItems[1], 1, 'aspect-square hover:opacity-90')}
                          {renderItem(mediaItems[2], 2, 'aspect-square hover:opacity-90')}
                        </div>
                      );
                    }

                    return (
                      <div className={`grid grid-cols-2 gap-0.5 max-w-[280px] ${isOnlyMedia ? 'rounded-[18px]' : 'rounded-xl'} overflow-hidden`}>
                        {renderItem(mediaItems[0], 0, 'aspect-square hover:opacity-90')}
                        {renderItem(mediaItems[1], 1, 'aspect-square hover:opacity-90')}
                        {renderItem(mediaItems[2], 2, 'aspect-square hover:opacity-90')}
                        {renderItem(mediaItems[3], 3, 'aspect-square hover:opacity-90')}
                      </div>
                    );
                  })()}
                </div>
              )}

              {fileItems.length > 0 && (
                <div className={`${message.content || mediaItems.length > 0 ? 'mt-2' : ''} flex flex-col gap-1.5`}>
                  {fileItems.map((att) => (
                    <a
                      key={att.id}
                      data-no-message-tap
                      href={att.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                        isOwn
                          ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Paperclip className="h-4 w-4 shrink-0" />
                      <span className="truncate font-medium">{att.file_name}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

            {hasReactions && (
              <MessageReactionBadge reactions={message.reactions} onClick={openReactionViewer} isOwn={isOwn} />
            )}
          </div>

          <div className={timestampClass}>
            {formatCompactTime(message.created_at)}
            {message.is_edited && <span className="ml-1 italic">edited</span>}
          </div>
        </div>
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
        onCopyText={handleCopyAction}
        copyLabel={copyLabel}
        onEdit={() => {
          setEditContent(message.content);
          setIsEditing(true);
        }}
        onDelete={handleDelete}
        onCreateTask={onCreateTask ? () => onCreateTask(message) : undefined}
        onClose={() => setDrawerOpen(false)}
        disableReply={disableReply}
        disableReactions={disableReactions}
      />
      <MessageReactionsOverlay
        isOpen={reactionViewerOpen}
        mode={reactionViewerMode}
        reactions={message.reactions}
        users={users}
        currentUserId={currentUserId}
        pendingEmoji={pendingReactionEmoji}
        onRemoveReaction={handleRemoveReaction}
        onClose={() => {
          setReactionViewerOpen(false);
          setPendingReactionEmoji(null);
        }}
      />
    </div>
  );
}
