import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

export interface UserEntry {
  id: string;
  name: string;
  role: string;
  avatar_url?: string | null;
}

interface SingleUserSelectProps {
  users: UserEntry[];
  selectedUserId: string | null;
  onSelect: (user: UserEntry) => void;
  placeholder?: string;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function SingleUserSelect({
  users,
  selectedUserId,
  onSelect,
  placeholder = 'Select an employee...',
  className = '',
}: SingleUserSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedUser = users.find(u => u.id === selectedUserId);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left transition-all hover:border-blue-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <div className="flex-shrink-0">
          {selectedUser ? (
            <div
              className="h-8 w-8 flex items-center justify-center rounded-full font-bold text-white text-[11px]"
              style={{ backgroundColor: getAvatarColor(selectedUser.name) }}
            >
              {getInitials(selectedUser.name)}
            </div>
          ) : (
            <div className="h-8 w-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <User className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {selectedUser ? (
            <>
              <p className="text-sm font-bold text-gray-800 truncate leading-tight">{selectedUser.name}</p>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{selectedUser.role}</p>
            </>
          ) : (
            <span className="text-sm font-medium text-gray-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute z-50 mt-2 w-full min-w-[280px] rounded-2xl border border-gray-100 bg-white p-2 shadow-xl ring-1 ring-black/5"
          >
            {/* Search Input */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search name or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border-none bg-gray-50 py-2.5 pl-9 pr-4 text-sm font-medium text-gray-700 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              />
            </div>

            {/* List */}
            <div className="max-h-[320px] overflow-y-auto overflow-x-hidden p-1 space-y-1">
              {filteredUsers.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-gray-400">No employees found</p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      onSelect(user);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-blue-50/50 ${
                      selectedUserId === user.id ? 'bg-blue-50/80' : ''
                    }`}
                  >
                    <div
                      className="h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-full font-bold text-white text-[11px] shadow-sm"
                      style={{ backgroundColor: getAvatarColor(user.name) }}
                    >
                      {getInitials(user.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${selectedUserId === user.id ? 'text-blue-700' : 'text-gray-700'}`}>
                        {user.name}
                      </p>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-widest">{user.role}</p>
                    </div>
                    {selectedUserId === user.id && (
                      <Check className="h-4 w-4 text-blue-600" />
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
