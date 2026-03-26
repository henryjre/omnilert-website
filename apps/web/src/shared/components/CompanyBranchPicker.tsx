import { useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, Check, ChevronDown, GitBranch, X } from 'lucide-react';
import { useBranchStore } from '@/shared/store/branchStore';

export interface CompanyBranchValue {
  companyId: string;
  branchId: string;
}

interface CompanyBranchPickerProps {
  value: CompanyBranchValue | null;
  onChange: (value: CompanyBranchValue | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

export function CompanyBranchPicker({
  value,
  onChange,
  disabled = false,
  label,
  placeholder = 'Select branch',
}: CompanyBranchPickerProps) {
  const companyBranchGroups = useBranchStore((s) => s.companyBranchGroups);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const selectedBranch = value
    ? companyBranchGroups
        .flatMap((g) => g.branches.map((b) => ({ ...b, companyId: g.id, companyName: g.name })))
        .find((b) => b.id === value.branchId && b.companyId === value.companyId)
    : null;

  const buttonLabel = selectedBranch
    ? selectedBranch.name
    : placeholder;

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">{label}</label>
      )}

      <div className="flex w-full items-center gap-1">
        <div ref={ref} className="relative flex-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`group flex w-full items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-200 ${
              disabled
                ? 'cursor-not-allowed border-gray-200 opacity-50'
                : 'border-gray-200 hover:border-primary-200 hover:bg-primary-50/30'
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <GitBranch className="h-4 w-4" />
            </span>
            <span className={`min-w-0 flex-1 truncate text-sm font-medium ${selectedBranch ? 'text-gray-800' : 'text-gray-400'}`}>
              {buttonLabel}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
                className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl"
              >
                {companyBranchGroups.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    No branches assigned
                  </div>
                ) : (
                  <div className="space-y-2 p-2">
                    {companyBranchGroups.map((company) => (
                      <section key={company.id}>
                        <div className="flex items-center gap-2 px-2 pb-1 pt-2">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          <span className="truncate text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {company.name}
                          </span>
                          <div className="h-px flex-1 bg-gray-100" />
                        </div>
                        <div className="space-y-0.5">
                          {company.branches.map((branch) => {
                            const isSelected =
                              value?.branchId === branch.id && value?.companyId === company.id;
                            return (
                              <button
                                key={branch.id}
                                type="button"
                                onClick={() => {
                                  onChange({ companyId: company.id, branchId: branch.id });
                                  setOpen(false);
                                }}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ${
                                  isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                <span
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
                                    isSelected
                                      ? 'bg-primary-600 text-white'
                                      : 'border border-gray-300 bg-white text-transparent'
                                  }`}
                                >
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-700">
                                  {branch.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
