import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, GitBranch, X } from 'lucide-react';
import { CompanyAvatar } from '@/features/company/components/CompanyAvatar';
import { useBranchStore } from '@/shared/store/branchStore';
import {
  clearAllBranchesToFirst,
  flattenCompanyBranchIds,
  formatBranchSelectionLabel,
  toggleCompanyBranchSelection,
  toggleGroupedBranchSelection,
  type SelectorCompanyGroup,
} from '@/shared/components/branchSelectorState';

function SelectionIndicator({ selected }: { selected: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
        selected
          ? 'bg-primary-600 text-white'
          : 'border border-gray-300 bg-white text-transparent'
      }`}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
  );
}

function CompanyAvatarStack({ groups, selectedBranchIds }: {
  groups: SelectorCompanyGroup[];
  selectedBranchIds: string[];
}) {
  const activeCompanies = groups.filter((g) =>
    g.branches.some((b) => selectedBranchIds.includes(b.id))
  );

  if (activeCompanies.length === 0 && groups.length > 0) {
    const first = groups[0];
    return (
      <CompanyAvatar name={first.name} logoUrl={first.logoUrl} themeColor={first.themeColor ?? '#2563EB'} size={20} />
    );
  }

  const visible = activeCompanies.slice(0, 3);
  const overflow = activeCompanies.length > 3 ? activeCompanies.length - 3 : 0;

  return (
    <div className="flex items-center">
      {visible.map((company, i) => (
        <div
          key={company.id}
          className={`ring-2 ring-white rounded-full ${i > 0 ? '-ml-1.5' : ''}`}
        >
          <CompanyAvatar
            name={company.name}
            logoUrl={company.logoUrl ?? null}
            themeColor={company.themeColor ?? '#2563EB'}
            size={20}
          />
        </div>
      ))}
      {overflow > 0 && (
        <div className="-ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 ring-2 ring-white text-[9px] font-semibold text-gray-600">
          +{overflow}
        </div>
      )}
    </div>
  );
}

function BranchSelectorContent({
  companyBranchGroups,
  selectedBranchIds,
  allSelected,
  onToggleAll,
  onToggleCompany,
  onToggleBranch,
  onApply,
  onDiscard,
  onClose,
  mobile = false,
}: {
  companyBranchGroups: SelectorCompanyGroup[];
  selectedBranchIds: string[];
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleCompany: (companyBranchIds: string[]) => void;
  onToggleBranch: (branchId: string) => void;
  onApply: () => void;
  onDiscard: () => void;
  onClose: () => void;
  mobile?: boolean;
}) {
  const selectedCount = selectedBranchIds.length;
  const totalCount = companyBranchGroups.reduce((sum, g) => sum + g.branches.length, 0);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50">
            <GitBranch className="h-3.5 w-3.5 text-primary-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Select Branches</p>
            <p className="text-xs text-gray-500">
              {selectedCount} of {totalCount} selected
            </p>
          </div>
        </div>
        {mobile && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close branch selector"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* All branches toggle */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-3 py-2.5">
          <button
            type="button"
            onClick={onToggleAll}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
              allSelected
                ? 'bg-primary-50 ring-1 ring-primary-200'
                : 'bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <SelectionIndicator selected={allSelected} />
            <span className="flex-1 text-sm font-semibold text-gray-900">All Branches</span>
            <span
              className={`tabular-nums text-xs font-medium ${
                allSelected ? 'text-primary-600' : 'text-gray-400'
              }`}
            >
              {totalCount}
            </span>
          </button>
        </div>

        {/* Company groups */}
        <div className="space-y-3 px-3 py-3">
          {companyBranchGroups.map((company) => {
            const companyBranchIds = company.branches.map((b) => b.id);
            const companyAllSelected = companyBranchIds.every((id) =>
              selectedBranchIds.includes(id),
            );

            return (
              <section key={company.id} className="space-y-1">
                {/* Company header with inline select-all */}
                <div className="flex items-center gap-2 px-1 py-1">
                  <CompanyAvatar
                    name={company.name}
                    logoUrl={company.logoUrl ?? null}
                    themeColor={company.themeColor ?? '#2563EB'}
                    size={16}
                    className="shrink-0"
                  />
                  <span className="truncate text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {company.name}
                  </span>
                  <div className="h-px flex-1 bg-gray-100" />
                  <button
                    type="button"
                    onClick={() => onToggleCompany(companyBranchIds)}
                    className={`shrink-0 text-xs font-medium transition-colors ${
                      companyAllSelected
                        ? 'text-primary-600 hover:text-primary-700'
                        : 'text-gray-400 hover:text-primary-600'
                    }`}
                  >
                    {companyAllSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                {/* Branch items */}
                <div className="space-y-0.5">
                  {company.branches.map((branch) => {
                    const isSelected = selectedBranchIds.includes(branch.id);
                    return (
                      <button
                        key={branch.id}
                        type="button"
                        onClick={() => onToggleBranch(branch.id)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                          isSelected
                            ? 'bg-primary-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <SelectionIndicator selected={isSelected} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">
                          {branch.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-3">
        <button
          type="button"
          onClick={onDiscard}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-800"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onApply}
          className="flex-1 rounded-xl bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export function BranchSelector() {
  const { companyBranchGroups, selectedBranchIds, setSelectedBranchIds } = useBranchStore();
  const [open, setOpen] = useState(false);
  // Local draft — mutations happen here; only committed to the store on Apply.
  const [draftIds, setDraftIds] = useState<string[]>(selectedBranchIds);
  const ref = useRef<HTMLDivElement>(null);

  const orderedBranchIds = flattenCompanyBranchIds(companyBranchGroups);
  const draftIdSet = new Set(draftIds);
  const allSelected =
    orderedBranchIds.length > 0 && orderedBranchIds.every((id) => draftIdSet.has(id));
  const label = formatBranchSelectionLabel(companyBranchGroups, selectedBranchIds);
  const canToggle = orderedBranchIds.length > 1;

  // Sync draft to the committed selection every time the panel opens so
  // previous uncommitted changes don't bleed into a fresh session.
  useEffect(() => {
    if (open) {
      setDraftIds(selectedBranchIds);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!canToggle) return null;

  // Draft toggle handlers — mutate local state only, not the store.
  const handleToggleAll = () => {
    if (allSelected) {
      setDraftIds(clearAllBranchesToFirst(companyBranchGroups));
      return;
    }
    setDraftIds(orderedBranchIds);
  };

  const handleToggleBranch = (branchId: string) => {
    setDraftIds(toggleGroupedBranchSelection(draftIds, branchId, orderedBranchIds));
  };

  const handleToggleCompany = (companyBranchIds: string[]) => {
    setDraftIds(toggleCompanyBranchSelection(draftIds, companyBranchIds, orderedBranchIds));
  };

  // Commit draft to the store and close.
  const handleApply = () => {
    setSelectedBranchIds(draftIds);
    setOpen(false);
  };

  // Revert draft changes back to the last committed selection, but keep the panel open.
  const handleDiscard = () => {
    setDraftIds(selectedBranchIds);
  };

  return (
    <div ref={ref} className="relative pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2 py-1 shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50/30 focus:outline-none focus:ring-2 focus:ring-primary-200"
      >
        <span className="flex shrink-0 items-center justify-center">
          <CompanyAvatarStack groups={companyBranchGroups} selectedBranchIds={selectedBranchIds} />
        </span>
        <span className="min-w-0 max-w-[8rem] truncate text-sm font-medium text-gray-700 sm:max-w-[12rem] lg:max-w-[16rem]">
          {label}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <>
            {/* Mobile backdrop */}
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 md:hidden"
              aria-label="Close branch selector"
            />

            {/* Mobile panel */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
              className="fixed inset-x-3 top-[4.5rem] bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-50 md:hidden"
            >
              <BranchSelectorContent
                companyBranchGroups={companyBranchGroups}
                selectedBranchIds={draftIds}
                allSelected={allSelected}
                onToggleAll={handleToggleAll}
                onToggleCompany={handleToggleCompany}
                onToggleBranch={handleToggleBranch}
                onApply={handleApply}
                onDiscard={handleDiscard}
                onClose={() => setOpen(false)}
                mobile
              />
            </motion.div>

            {/* Desktop dropdown */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 hidden w-80 md:block"
            >
              <BranchSelectorContent
                companyBranchGroups={companyBranchGroups}
                selectedBranchIds={draftIds}
                allSelected={allSelected}
                onToggleAll={handleToggleAll}
                onToggleCompany={handleToggleCompany}
                onToggleBranch={handleToggleBranch}
                onApply={handleApply}
                onDiscard={handleDiscard}
                onClose={() => setOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
