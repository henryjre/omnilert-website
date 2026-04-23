import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { CaseMessage } from '@omnilert/shared';
import type { MentionableUser } from '../services/caseReport.api';

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

type ReactionViewerMode = 'desktop' | 'mobile';

interface MessageReactionsOverlayProps {
  isOpen: boolean;
  mode: ReactionViewerMode;
  reactions: CaseMessage['reactions'];
  users?: MentionableUser[];
  currentUserId: string;
  pendingEmoji?: string | null;
  onRemoveReaction: (emoji: string) => void;
  onClose: () => void;
}

type ReactionFilter = 'all' | string;

export function MessageReactionsOverlay({
  isOpen,
  mode,
  reactions,
  users,
  currentUserId,
  pendingEmoji,
  onRemoveReaction,
  onClose,
}: MessageReactionsOverlayProps) {
  const [activeFilter, setActiveFilter] = useState<ReactionFilter>('all');

  const totalCount = useMemo(
    () => reactions.reduce((sum, reaction) => sum + reaction.users.length, 0),
    [reactions],
  );

  const tabs = useMemo(
    () => [
      { key: 'all' as const, label: 'All', count: totalCount },
      ...reactions.map((reaction) => ({
        key: reaction.emoji,
        label: reaction.emoji,
        count: reaction.users.length,
      })),
    ],
    [reactions, totalCount],
  );

  const rows = useMemo(
    () =>
      reactions.flatMap((reaction) =>
        reaction.users.map((user) => {
          const matchedUser = users?.find((item) => item.id === user.id);
          return {
            id: `${reaction.emoji}-${user.id}`,
            userId: user.id,
            name: user.name,
            emoji: reaction.emoji,
            avatarUrl: matchedUser?.avatar_url ?? null,
            isCurrentUser: user.id === currentUserId,
          };
        }),
      ),
    [currentUserId, reactions, users],
  );

  const filteredRows = useMemo(
    () => (activeFilter === 'all' ? rows : rows.filter((row) => row.emoji === activeFilter)),
    [activeFilter, rows],
  );

  useEffect(() => {
    if (!isOpen) return;
    setActiveFilter('all');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (totalCount === 0) {
      onClose();
    }
  }, [isOpen, onClose, totalCount]);

  useEffect(() => {
    if (activeFilter === 'all') return;
    if (!reactions.some((reaction) => reaction.emoji === activeFilter)) {
      setActiveFilter('all');
    }
  }, [activeFilter, reactions]);

  useEffect(() => {
    if (!isOpen) return;

    document.body.classList.add('overflow-hidden');

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('overflow-hidden');
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  const content = (
    <div className="flex max-h-full flex-col overflow-hidden rounded-[inherit] bg-white text-gray-900">
      {mode === 'mobile' && (
        <div className="flex justify-center pb-2 pt-3">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>
      )}

      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-xl font-semibold tracking-tight">Message reactions</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900"
          aria-label="Close reactions"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="overflow-x-auto border-b border-gray-100 px-5">
        <div className="flex min-w-max gap-4">
          {tabs.map((tab) => {
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveFilter(tab.key)}
                className={`border-b-2 px-1 py-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.label} <span className="ml-[2px] font-medium opacity-70">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {filteredRows.length === 0 ? (
          <div className="flex h-full min-h-40 items-center justify-center text-sm text-gray-400">
            No reactions here yet.
          </div>
        ) : (
          <div className="space-y-1">
            {filteredRows.map((row) => {
              const isPending = pendingEmoji === row.emoji;
              return (
                <button
                  key={row.id}
                  type="button"
                  disabled={!row.isCurrentUser || isPending}
                  onClick={() => {
                    if (!row.isCurrentUser || isPending) return;
                    onRemoveReaction(row.emoji);
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors ${
                    row.isCurrentUser
                      ? 'hover:bg-gray-50 active:bg-gray-100'
                      : 'cursor-default'
                  } ${isPending ? 'opacity-60' : ''}`}
                >
                  {row.avatarUrl ? (
                    <img
                      src={row.avatarUrl}
                      alt={row.name}
                      className="h-11 w-11 rounded-full object-cover shadow-sm ring-1 ring-black/5"
                    />
                  ) : (
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm ring-1 ring-black/5"
                      style={{ backgroundColor: getAvatarColor(row.name) }}
                    >
                      {getInitials(row.name)}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-gray-900">{row.name}</p>
                    <p className="text-sm text-gray-500">
                      {row.isCurrentUser
                        ? isPending
                          ? 'Removing reaction...'
                          : 'Tap to remove'
                        : `Reacted with ${row.emoji}`}
                    </p>
                  </div>

                  <span className="text-[1.8rem] leading-none drop-shadow-sm">{row.emoji}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-black/20 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          {mode === 'desktop' ? (
            <motion.div
              className="fixed inset-0 z-[80] flex items-center justify-center p-4"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="h-[min(78vh,40rem)] w-full max-w-xl overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl">
                {content}
              </div>
            </motion.div>
          ) : (
            <motion.div
              className="fixed inset-x-0 bottom-0 z-[80] max-h-[85vh] overflow-hidden rounded-t-[1.75rem] border-t border-gray-100 bg-white shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            >
              <div className="h-[min(85vh,42rem)]">{content}</div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
