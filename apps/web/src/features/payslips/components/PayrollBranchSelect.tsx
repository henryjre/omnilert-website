import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { CompanyAvatar } from '@/features/company/components/CompanyAvatar';
import type { SelectorCompanyGroup } from '@/shared/components/branchSelectorState';

interface PayrollBranchSelectProps {
  groups: SelectorCompanyGroup[];
  selectedBranchId: string;
  onSelect: (branchId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PayrollBranchSelect({
  groups,
  selectedBranchId,
  onSelect,
  placeholder = 'Select a branch...',
  disabled = false,
  className = '',
}: PayrollBranchSelectProps) {
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

  const branchLookup = useMemo(
    () =>
      groups.flatMap((group) =>
        group.branches.map((branch) => ({
          ...branch,
          logoUrl: group.logoUrl ?? null,
          themeColor: group.themeColor ?? '#2563EB',
          companyLabel: group.name,
        })),
      ),
    [groups],
  );

  const selectedBranch = branchLookup.find((branch) => branch.id === selectedBranchId) ?? null;
  const query = search.trim().toLowerCase();

  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          branches: group.branches.filter((branch) => {
            if (!query) return true;
            return (
              branch.name.toLowerCase().includes(query)
              || group.name.toLowerCase().includes(query)
            );
          }),
        }))
        .filter((group) => group.branches.length > 0),
    [groups, query],
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        disabled={disabled}
        className={`flex w-full items-center gap-3 rounded-xl border border-gray-200 px-4 py-2.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
          disabled
            ? 'cursor-not-allowed bg-gray-50 opacity-60'
            : 'bg-white hover:border-blue-400 hover:shadow-sm'
        }`}
      >
        <CompanyAvatar
          name={selectedBranch?.companyLabel ?? 'Branch'}
          logoUrl={selectedBranch?.logoUrl}
          themeColor={selectedBranch?.themeColor ?? '#CBD5E1'}
          size={32}
          className="shrink-0 shadow-sm ring-1 ring-black/5"
        />
        <div className="min-w-0 flex-1">
          {selectedBranch ? (
            <>
              <p className="truncate text-sm font-bold leading-tight text-gray-800">
                {selectedBranch.name}
              </p>
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-gray-400">
                {selectedBranch.companyLabel}
              </p>
            </>
          ) : (
            <span className="text-sm font-medium text-gray-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
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
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search branch or company..."
              className="w-full rounded-xl border-none bg-gray-50 py-2.5 pl-9 pr-4 text-sm font-medium text-gray-700 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          <div className="space-y-2 overflow-y-auto p-1" style={{ maxHeight: dropdownStyle.maxHeight }}>
            {filteredGroups.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-medium text-gray-400">No branches found</p>
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.id}>
                  <div className="mb-1 flex items-center gap-2 px-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: group.themeColor ?? '#94A3B8' }}
                    />
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {group.name}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {group.branches.map((branch) => {
                      const isSelected = selectedBranchId === branch.id;
                      return (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() => {
                            onSelect(branch.id);
                            setOpen(false);
                            setSearch('');
                          }}
                          className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all ${
                            isSelected ? 'bg-blue-50/80' : 'hover:bg-blue-50/50'
                          }`}
                        >
                          <CompanyAvatar
                            name={group.name}
                            logoUrl={group.logoUrl ?? null}
                            themeColor={group.themeColor ?? '#2563EB'}
                            size={32}
                            className="shrink-0 shadow-sm ring-1 ring-black/5"
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-sm font-bold ${
                                isSelected ? 'text-blue-700' : 'text-gray-700'
                              }`}
                            >
                              {branch.name}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-[10px] font-medium uppercase tracking-widest text-gray-400">
                                {group.name}
                              </p>
                              {branch.is_main_branch ? (
                                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                                  Main
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {isSelected ? <Check className="h-4 w-4 text-blue-600" /> : null}
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
