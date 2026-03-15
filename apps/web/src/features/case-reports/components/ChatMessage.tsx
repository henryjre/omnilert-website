import { useRef, useState } from 'react';
import type { CaseMessage } from '@omnilert/shared';
import { EmojiPicker } from './EmojiPicker';
import { MessageActionMenu } from './MessageActionMenu';
import { MessageDrawer } from './MessageDrawer';

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
  for (const msg of messages) {
    if (msg.id === id) return msg;
    if (msg.replies) {
      const found = findInTree(msg.replies, id);
      if (found) return found;
    }
  }
  return undefined;
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
  onScrollToMessage: (messageId: string) => void;
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
  onScrollToMessage,
}: ChatMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Long press handlers ───────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    longPressTimer.current = setTimeout(() => {
      setDrawerOpen(true);
    }, 500);
  }

  function handlePointerUp() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerCancel() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  // ── Delete handler ────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!window.confirm('Delete this message?')) return;
    await onDelete(message.id);
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
    <div
      data-message-id={message.id}
      className="group relative flex gap-3 py-1"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
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
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">{message.content}</p>
        )}

        {/* Attachments */}
        {message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.file_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-primary-700 hover:bg-gray-100"
              >
                {attachment.file_name}
              </a>
            ))}
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

      {/* Desktop: smiley + ⋯ button (shown on group hover, hidden on touch/mobile) */}
      {!chatLocked && (
        <div className="absolute right-0 top-1 hidden items-center gap-1 group-hover:flex sm:flex">
          <div className="relative">
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((v) => !v)}
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
              />
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
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
              />
            )}
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      <MessageDrawer
        isOpen={drawerOpen}
        message={message}
        currentUserId={currentUserId}
        canManage={canManage}
        chatLocked={chatLocked}
        userHasReacted={(emoji) => message.reactions.some((r) => r.emoji === emoji && r.users.some((u) => u.id === currentUserId))}
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
