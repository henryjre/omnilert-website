import { motion, AnimatePresence } from 'framer-motion';
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
  const term = query.trim().toLowerCase();
  const filteredUsers = users
    .filter((user) => !term || user.name.toLowerCase().includes(term))
    .slice(0, 8);
  const filteredRoles = roles
    .filter((role) => !term || role.name.toLowerCase().includes(term))
    .slice(0, 5);

  const hasResults = filteredUsers.length > 0 || filteredRoles.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="absolute bottom-full left-0 z-[100] mb-3 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5"
        >
          <div className="max-h-72 overflow-y-auto p-1.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-200">
            {/* Users Section */}
            <div>
              <p className="sticky top-0 z-10 bg-white/95 px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 backdrop-blur-sm">
                Users
              </p>
              {filteredUsers.length === 0 ? (
                !filteredRoles.length && (
                  <div className="px-3 py-4 text-center">
                    <p className="text-sm text-gray-400 font-medium">
                      No matches found for "@{query}"
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-0.5">
                  {filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => onSelectUser(user)}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-primary-50"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 text-xs font-bold text-gray-600 group-hover:from-primary-100 group-hover:to-primary-200 group-hover:text-primary-700">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt=""
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          user.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-700 group-hover:text-primary-900">
                          {user.name}
                        </p>
                        <p className="text-[10px] text-gray-400 group-hover:text-primary-500">
                          @member
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Roles Section */}
            <div className={filteredUsers.length > 0 ? 'mt-3 border-t border-gray-50 pt-3' : ''}>
              {(filteredRoles.length > 0 || !hasResults) && (
                <p className="sticky top-0 z-10 bg-white/95 px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 backdrop-blur-sm">
                  Roles
                </p>
              )}
              {filteredRoles.length === 0 ? (
                hasResults ||
                null // Already handled by the "No matches" above if everything is empty
              ) : (
                <div className="space-y-0.5 pb-1">
                  {filteredRoles.map((role) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => onSelectRole(role)}
                      className="group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-all hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: role.color ?? '#94a3b8' }}
                        />
                        <span className="truncate text-sm font-semibold text-gray-700 group-hover:text-gray-900">
                          {role.name}
                        </span>
                      </div>
                      <span className="shrink-0 text-[10px] font-medium text-gray-400 uppercase tracking-tight">
                        @role
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer Hint */}
          <div className="border-t border-gray-50 bg-gray-50/50 px-3 py-2">
            <p className="text-[10px] text-gray-400">Continue typing to narrow down results...</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
