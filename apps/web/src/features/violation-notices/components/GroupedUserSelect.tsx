import { useState, useRef, useEffect } from 'react';
import type { GroupedUsersResponse } from '@omnilert/shared';
import { X, ChevronDown, Search } from 'lucide-react';
import { Spinner } from '@/shared/components/ui/Spinner';

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

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserEntry {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface GroupedUserSelectProps {
  groupedUsers: GroupedUsersResponse | null;
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  singleSelect?: boolean;
  suspendedUserIds?: string[];
}

// ── Avatar atom ────────────────────────────────────────────────────────────────

function UserAvatar({ user, size = 'sm' }: { user: UserEntry; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs';
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        className={`${dim} rounded-full object-cover shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${dim} flex items-center justify-center rounded-full font-semibold text-white shrink-0`}
      style={{ backgroundColor: getAvatarColor(user.name) }}
    >
      {getInitials(user.name)}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function GroupedUserSelect({
  groupedUsers,
  selectedUserIds,
  onChange,
  loading = false,
  disabled = false,
  placeholder = 'Select employees...',
  singleSelect = false,
  suspendedUserIds = [],
}: GroupedUserSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Build a flat lookup map
  const allUsers: UserEntry[] = groupedUsers
    ? [
        ...groupedUsers.management,
        ...groupedUsers.service_crew,
        ...groupedUsers.other,
      ]
    : [];

  const selectedUsers = allUsers.filter((u) => selectedUserIds.includes(u.id));

  function toggleUser(userId: string) {
    if (suspendedUserIds.includes(userId)) return;
    if (singleSelect) {
      onChange(selectedUserIds.includes(userId) ? [] : [userId]);
      setOpen(false);
      return;
    }
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedUserIds, userId]);
    }
  }

  function removeUser(userId: string) {
    onChange(selectedUserIds.filter((id) => id !== userId));
  }

  const query = search.toLowerCase();

  function filterUsers(users: UserEntry[]) {
    if (!query) return users;
    return users.filter((u) => u.name.toLowerCase().includes(query));
  }

  const groups: { label: string; users: UserEntry[] }[] = groupedUsers
    ? [
        { label: 'Management', users: filterUsers(groupedUsers.management) },
        { label: 'Service Crew', users: filterUsers(groupedUsers.service_crew) },
        { label: 'Other', users: filterUsers(groupedUsers.other) },
      ].filter((g) => g.users.length > 0)
    : [];

  const triggerLabel =
    selectedUserIds.length === 0
      ? placeholder
      : singleSelect
        ? (selectedUsers[0]?.name ?? placeholder)
        : `${selectedUserIds.length} employee${selectedUserIds.length === 1 ? '' : 's'} selected`;

  return (
    <div ref={containerRef} className="relative">
      {/* Selected chips (multi-select only) */}
      {!singleSelect && selectedUsers.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedUsers.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 pl-1 pr-1.5 py-0.5 text-xs text-gray-700"
            >
              <UserAvatar user={user} size="sm" />
              <span>{user.name}</span>
              <button
                type="button"
                onClick={() => removeUser(user.id)}
                disabled={disabled}
                className="ml-0.5 rounded-full text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary-500 ${
          open ? 'border-primary-500 ring-1 ring-primary-500' : 'border-gray-300'
        } ${disabled ? 'cursor-not-allowed opacity-50 bg-gray-50' : 'bg-white hover:border-gray-400'}`}
      >
        <span className={selectedUserIds.length === 0 ? 'text-gray-400' : 'text-gray-900'}>
          {triggerLabel}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
          {/* Search */}
          <div className="border-b border-gray-100 p-2">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees..."
                className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
                autoFocus
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="max-h-60 overflow-y-auto py-1">
            {loading ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No employees found.</p>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {group.label}
                  </p>
                  {group.users.map((user) => {
                    const selected = selectedUserIds.includes(user.id);
                    const isSuspended = suspendedUserIds.includes(user.id);
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => toggleUser(user.id)}
                        disabled={isSuspended}
                        className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors ${
                          isSuspended
                            ? 'cursor-not-allowed opacity-50'
                            : selected
                              ? 'bg-primary-50 text-primary-700 hover:bg-primary-50'
                              : 'text-gray-800 hover:bg-gray-50'
                        }`}
                      >
                        <UserAvatar user={user} size="sm" />
                        <span className="flex-1 truncate">{user.name}</span>
                        {isSuspended ? (
                          <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                            Wallet Suspended
                          </span>
                        ) : selected && !singleSelect ? (
                          <span className="h-4 w-4 shrink-0 rounded-full bg-primary-600 text-[10px] font-bold text-white flex items-center justify-center">
                            ✓
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
