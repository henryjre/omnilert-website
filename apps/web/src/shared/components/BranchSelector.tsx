import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Check, ChevronDown, GitBranch, X } from 'lucide-react';
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

function BranchSelectorContent({
  companyBranchGroups,
  selectedBranchIds,
  allSelected,
  onToggleAll,
  onToggleCompany,
  onToggleBranch,
  onClose,
  mobile = false,
}: {
  companyBranchGroups: SelectorCompanyGroup[];
  selectedBranchIds: string[];
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleCompany: (companyBranchIds: string[]) => void;
  onToggleBranch: (branchId: string) => void;
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
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
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
    </div>
  );
}

export function BranchSelector() {
  const { companyBranchGroups, selectedBranchIds, setSelectedBranchIds } = useBranchStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const orderedBranchIds = flattenCompanyBranchIds(companyBranchGroups);
  const selectedBranchIdSet = new Set(selectedBranchIds);
  const allSelected =
    orderedBranchIds.length > 0 && orderedBranchIds.every((id) => selectedBranchIdSet.has(id));
  const label = formatBranchSelectionLabel(companyBranchGroups, selectedBranchIds);
  const canToggle = orderedBranchIds.length > 1;

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

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedBranchIds(clearAllBranchesToFirst(companyBranchGroups));
      return;
    }
    setSelectedBranchIds(orderedBranchIds);
  };

  const handleToggleBranch = (branchId: string) => {
    setSelectedBranchIds(
      toggleGroupedBranchSelection(selectedBranchIds, branchId, orderedBranchIds),
    );
  };

  const handleToggleCompany = (companyBranchIds: string[]) => {
    setSelectedBranchIds(
      toggleCompanyBranchSelection(selectedBranchIds, companyBranchIds, orderedBranchIds),
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50/30 focus:outline-none focus:ring-2 focus:ring-primary-200 md:px-3.5 md:py-2.5"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <GitBranch className="h-4 w-4" />
        </span>
        <span className="hidden min-w-0 max-w-[12rem] truncate text-sm font-semibold text-gray-700 sm:block lg:max-w-[16rem]">
          {label}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
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
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="fixed inset-x-3 top-[4.5rem] bottom-3 z-50 md:hidden"
            >
              <BranchSelectorContent
                companyBranchGroups={companyBranchGroups}
                selectedBranchIds={selectedBranchIds}
                allSelected={allSelected}
                onToggleAll={handleToggleAll}
                onToggleCompany={handleToggleCompany}
                onToggleBranch={handleToggleBranch}
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
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 hidden w-[26rem] md:block lg:w-[30rem]"
            >
              <BranchSelectorContent
                companyBranchGroups={companyBranchGroups}
                selectedBranchIds={selectedBranchIds}
                allSelected={allSelected}
                onToggleAll={handleToggleAll}
                onToggleCompany={handleToggleCompany}
                onToggleBranch={handleToggleBranch}
                onClose={() => setOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
