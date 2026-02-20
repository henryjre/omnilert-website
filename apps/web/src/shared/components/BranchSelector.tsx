import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { PERMISSIONS } from '@omnilert/shared';

export function BranchSelector() {
  const { branches, selectedBranchIds, toggleBranch, selectAll } = useBranchStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { hasPermission } = usePermission();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Hide the selector when the user is restricted to specific branches and lacks toggle permission.
  // Users with no assigned branches (e.g. admins) or with the explicit toggle permission always see it.
  const userHasAssignedBranches = user?.branchIds && user.branchIds.length > 0;
  const canToggle = hasPermission(PERMISSIONS.ADMIN_TOGGLE_BRANCH) || !userHasAssignedBranches;
  if (!canToggle) return null;

  if (branches.length === 0) return null;

  // Show branch count or single branch name
  const allSelected = selectedBranchIds.length === branches.length;
  const singleSelected = selectedBranchIds.length === 1 
    ? branches.find((b) => b.id === selectedBranchIds[0])?.name 
    : null;
  const label = allSelected
    ? 'All Branches'
    : singleSelected 
      ? singleSelected 
      : `${selectedBranchIds.length} Branches`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
      >
        {label}
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {/* All Branches */}
          <button
            onClick={selectAll}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 ${
              selectedBranchIds.length === branches.length ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
            }`}
          >
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              selectedBranchIds.length === branches.length ? 'border-primary-600 bg-primary-600' : 'border-gray-300'
            }`}>
              {selectedBranchIds.length === branches.length && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </span>
            <span className="font-medium text-gray-700">All Branches</span>
          </button>

          <div className="my-1 border-t border-gray-100" />

          {branches
            .slice()
            .sort((a, b) => parseInt(a.odoo_branch_id || '0', 10) - parseInt(b.odoo_branch_id || '0', 10))
            .map((branch) => {
            const isSelected = selectedBranchIds.includes(branch.id);
            return (
              <button
                key={branch.id}
                onClick={() => toggleBranch(branch.id)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 ${
                  isSelected ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  isSelected ? 'border-primary-600 bg-primary-600' : 'border-gray-300'
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </span>
                <span className="text-gray-700">{branch.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
