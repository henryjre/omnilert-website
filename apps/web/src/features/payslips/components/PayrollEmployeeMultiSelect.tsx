import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GroupedUsersResponse } from '@omnilert/shared';

interface PayrollEmployeeMultiSelectProps {
  groupedUsers: GroupedUsersResponse | null;
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function PayrollEmployeeMultiSelect({
  groupedUsers,
  selectedUserIds,
  onChange,
  loading = false,
  disabled = false,
  placeholder = 'Select employee(s)...',
}: PayrollEmployeeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    placement: 'top' | 'bottom';
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      const clickedTrigger = containerRef.current?.contains(target) ?? false;
      const clickedDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!clickedTrigger && !clickedDropdown) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function updateDropdownPosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const preferTop = spaceBelow < 280 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        180,
        Math.min(preferTop ? spaceAbove - 12 : spaceBelow - 12, 320),
      );

      setDropdownStyle({
        left: rect.left,
        top: preferTop ? rect.top - 8 : rect.bottom + 8,
        width: rect.width,
        maxHeight,
        placement: preferTop ? 'top' : 'bottom',
      });
    }

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [open]);

  const allUsers = useMemo(
    () =>
      groupedUsers
        ? [
            ...groupedUsers.management,
            ...groupedUsers.service_crew,
            ...groupedUsers.other,
          ]
        : [],
    [groupedUsers],
  );

  const selectedUsers = useMemo(
    () => allUsers.filter((user) => selectedUserIds.includes(user.id)),
    [allUsers, selectedUserIds],
  );

  const query = search.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!groupedUsers) return [];

    const filterUsers = (users: Array<{ id: string; name: string; avatar_url: string | null }>) => (
      query
        ? users.filter((user) => user.name.toLowerCase().includes(query))
        : users
    );

    return [
      { label: 'Management', users: filterUsers(groupedUsers.management) },
      { label: 'Service Crew', users: filterUsers(groupedUsers.service_crew) },
      { label: 'Other', users: filterUsers(groupedUsers.other) },
    ].filter((group) => group.users.length > 0);
  }, [groupedUsers, query]);

  const triggerLabel =
    selectedUserIds.length === 0
      ? placeholder
      : selectedUserIds.length === 1
        ? selectedUsers[0]?.name ?? placeholder
        : `${selectedUserIds.length} employees selected`;

  function toggleUser(userId: string) {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId));
      return;
    }

    onChange([...selectedUserIds, userId]);
  }

  const summaryText =
    selectedUsers.length > 1
      ? selectedUsers.map((user) => user.name).join(', ')
      : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        disabled={disabled}
        className={`w-full rounded-xl border px-4 py-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
          disabled
            ? 'cursor-not-allowed bg-gray-50 opacity-60'
            : 'bg-white hover:border-blue-400 hover:shadow-sm'
        } ${
          open ? 'border-blue-400 shadow-sm' : 'border-gray-200'
        }`}
      >
        <p className={`truncate text-sm font-medium ${selectedUserIds.length === 0 ? 'text-gray-400' : 'text-gray-800'}`}>
          {triggerLabel}
        </p>
        {summaryText ? (
          <p className="mt-1 line-clamp-2 text-[11px] text-gray-400">
            {summaryText}
          </p>
        ) : null}
      </button>

      {open && dropdownStyle ? createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[70] rounded-2xl border border-gray-100 bg-white p-2 shadow-xl ring-1 ring-black/5"
          style={{
            left: dropdownStyle.left,
            top: dropdownStyle.top,
            width: dropdownStyle.width,
            transform: dropdownStyle.placement === 'top' ? 'translateY(-100%)' : undefined,
          }}
        >
          <div className="mb-2 border-b border-gray-100 p-1 pb-2">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employees..."
              className="w-full rounded-xl border-none bg-gray-50 px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          <div className="space-y-2 overflow-y-auto p-1" style={{ maxHeight: dropdownStyle.maxHeight }}>
            {loading ? (
              <div className="py-6 text-center text-sm text-gray-400">
                Loading employees...
              </div>
            ) : groups.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400">
                No employees found.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.label}>
                  <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.users.map((user) => {
                      const selected = selectedUserIds.includes(user.id);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => toggleUser(user.id)}
                          className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                            selected
                              ? 'bg-primary-50 text-primary-700'
                              : 'text-gray-800 hover:bg-gray-50'
                          }`}
                        >
                          <span className="truncate text-sm font-medium">
                            {user.name}
                          </span>
                          {selected ? (
                            <span className="shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                              Selected
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
