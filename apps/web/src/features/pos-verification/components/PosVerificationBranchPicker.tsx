import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, LockKeyhole, X } from 'lucide-react';
import { CompanyAvatar } from '@/features/company/components/CompanyAvatar';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import type { SelectorCompanyGroup } from '@/shared/components/branchSelectorState';
import type { Branch } from '@/shared/store/branchStore';

function isMobileBranchPickerViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

interface PosVerificationBranchPickerProps {
  companyBranchGroups: SelectorCompanyGroup[];
  currentBranch: Branch | null;
  currentLabel: string;
  options: Branch[];
  locked: boolean;
  disabled: boolean;
  onSelect: (branchId: string) => void;
}

function resolveCompanyMeta(
  branch: Branch | null,
  companyBranchGroups: SelectorCompanyGroup[],
): { name: string; logoUrl: string | null; themeColor: string } | null {
  if (!branch) return null;

  const group = companyBranchGroups.find((item) => item.id === branch.companyId);
  return {
    name: group?.name ?? branch.companyName,
    logoUrl: group?.logoUrl ?? null,
    themeColor: group?.themeColor ?? '#2563EB',
  };
}

function BranchPickerPanel({
  companyBranchGroups,
  currentBranchId,
  options,
  onSelect,
  onClose,
}: {
  companyBranchGroups: SelectorCompanyGroup[];
  currentBranchId: string | null;
  options: Branch[];
  onSelect: (branchId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex max-h-[min(34rem,80vh)] flex-col overflow-hidden rounded-2xl bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">POS Verification Branch</p>
          <p className="mt-1 text-xs text-gray-500">
            Pick one branch to view the real time POS verification updates.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
          aria-label="Close branch picker"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 overflow-y-auto px-3 py-3">
        {options.map((branch) => {
          const companyMeta = resolveCompanyMeta(branch, companyBranchGroups);
          const selected = branch.id === currentBranchId;

          return (
            <button
              key={branch.id}
              type="button"
              onClick={() => {
                onSelect(branch.id);
                onClose();
              }}
              className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all ${
                selected
                  ? 'border-primary-200 bg-primary-50/80 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-primary-200 hover:bg-primary-50/30'
              }`}
            >
              {companyMeta ? (
                <CompanyAvatar
                  name={companyMeta.name}
                  logoUrl={companyMeta.logoUrl}
                  themeColor={companyMeta.themeColor}
                  size={36}
                  className="shrink-0 ring-2 ring-white"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                  {branch.name.trim()[0]?.toUpperCase() ?? '?'}
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">
                  {branch.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-gray-500">
                  {branch.companyName}
                </span>
              </span>

              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  selected
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'border-gray-300 bg-white text-transparent'
                }`}
                aria-hidden
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PosVerificationBranchPicker({
  companyBranchGroups,
  currentBranch,
  currentLabel,
  options,
  locked,
  disabled,
  onSelect,
}: PosVerificationBranchPickerProps) {
  const [open, setOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => isMobileBranchPickerViewport());
  const companyMeta = useMemo(
    () => resolveCompanyMeta(currentBranch, companyBranchGroups),
    [companyBranchGroups, currentBranch],
  );
  const canOpen = !locked && !disabled && options.length > 1;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const updateViewport = () => setIsMobileViewport(media.matches);

    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (!open || !isMobileViewport) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileViewport, open]);

  useEffect(() => {
    if (!canOpen && open) {
      setOpen(false);
    }
  }, [canOpen, open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!canOpen) return;
          setOpen((value) => !value);
        }}
        aria-expanded={canOpen ? open : undefined}
        aria-haspopup={canOpen ? 'dialog' : undefined}
        aria-disabled={!canOpen}
        className={`group flex min-w-[12rem] items-center justify-between gap-3 rounded-full border px-3 py-2 shadow-sm transition-all focus:outline-none ${
          locked
            ? 'cursor-default border-primary-200 bg-primary-50/70 text-primary-700'
            : canOpen
              ? 'border-gray-200 bg-white hover:border-primary-200 hover:bg-primary-50/30 focus:ring-2 focus:ring-primary-200'
              : 'cursor-default border-gray-200 bg-white/90 text-gray-500'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {companyMeta ? (
            <CompanyAvatar
              name={companyMeta.name}
              logoUrl={companyMeta.logoUrl}
              themeColor={companyMeta.themeColor}
              size={22}
              className="shrink-0 ring-2 ring-white"
            />
          ) : (
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700">
              {currentLabel.trim()[0]?.toUpperCase() ?? '?'}
            </span>
          )}

          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-700">
              {currentLabel}
            </span>
          </span>
        </span>

        {locked ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 text-primary-600">
            <LockKeyhole className="h-3.5 w-3.5" />
          </span>
        ) : canOpen ? (
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          isMobileViewport ? (
            <>
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-40 bg-black/30"
                aria-label="Close branch picker"
              />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-50"
              >
                <div className="mx-auto flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-[1.75rem] bg-white shadow-2xl">
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="h-1 w-10 rounded-full bg-gray-300" />
                  </div>
                  <BranchPickerPanel
                    companyBranchGroups={companyBranchGroups}
                    currentBranchId={currentBranch?.id ?? null}
                    options={options}
                    onSelect={onSelect}
                    onClose={() => setOpen(false)}
                  />
                </div>
              </motion.div>
            </>
          ) : (
            <>
              <AnimatedModal
                onBackdropClick={() => setOpen(false)}
                maxWidth="max-w-lg"
                zIndexClass="z-[60]"
              >
                <BranchPickerPanel
                  companyBranchGroups={companyBranchGroups}
                  currentBranchId={currentBranch?.id ?? null}
                  options={options}
                  onSelect={onSelect}
                  onClose={() => setOpen(false)}
                />
              </AnimatedModal>
            </>
          )
        )}
      </AnimatePresence>
    </>
  );
}
