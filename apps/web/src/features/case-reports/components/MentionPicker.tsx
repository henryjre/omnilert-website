import type { MentionableRole, MentionableUser } from '../services/caseReport.api';

interface MentionPickerProps {
  isOpen: boolean;
  query: string;
  users: MentionableUser[];
  roles: MentionableRole[];
  onSelectUser: (user: MentionableUser) => void;
  onSelectRole: (role: MentionableRole) => void;
}

export function MentionPicker({
  isOpen,
  query,
  users,
  roles,
  onSelectUser,
  onSelectRole,
}: MentionPickerProps) {
  if (!isOpen) return null;

  const term = query.trim().toLowerCase();
  const filteredUsers = users.filter((user) => !term || user.name.toLowerCase().includes(term)).slice(0, 5);
  const filteredRoles = roles.filter((role) => !term || role.name.toLowerCase().includes(term)).slice(0, 5);

  return (
    <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
      <div className="max-h-64 overflow-y-auto">
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Users</p>
        {filteredUsers.length === 0 ? (
          <p className="px-2 py-1 text-sm text-gray-400">No users found</p>
        ) : (
          filteredUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => onSelectUser(user)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <span>{user.name}</span>
              <span className="text-xs text-gray-400">@user</span>
            </button>
          ))
        )}

        <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Roles</p>
        {filteredRoles.length === 0 ? (
          <p className="px-2 py-1 text-sm text-gray-400">No roles found</p>
        ) : (
          filteredRoles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => onSelectRole(role)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <span>{role.name}</span>
              <span className="text-xs text-gray-400">@role</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
