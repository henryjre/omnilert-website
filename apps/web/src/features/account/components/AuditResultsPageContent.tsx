import React from 'react';
import type { AccountAuditResultListItem, StoreAuditType } from '@omnilert/shared';
import { ClipboardList, LayoutGrid, ShieldCheck, Star } from 'lucide-react';
import { Pagination } from '../../../shared/components/ui/Pagination';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { AccountAuditResultCard } from './AccountAuditResultCard';

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryTab = 'all' | StoreAuditType;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Extracted so both the tabs row and the mobile header label can reference it. */
const CATEGORY_TABS: ViewOption<CategoryTab>[] = [
  { id: 'all',              label: 'All Categories',       icon: LayoutGrid  },
  { id: 'customer_service', label: 'Customer Service',     icon: Star        },
  { id: 'compliance',       label: 'Compliance Audit',     icon: ShieldCheck },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

/** Mirrors AccountAuditResultCard's structure while data is loading. */
function AuditResultSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-4 w-16 rounded bg-gray-200" />
          <div className="h-4 w-48 rounded bg-gray-200" />
        </div>
        <div className="h-3 w-28 rounded bg-gray-200" />
      </div>
      <div className="mt-2 flex justify-between gap-3">
        <div className="h-3 w-36 rounded bg-gray-200" />
        <div className="h-3 w-28 rounded bg-gray-200" />
      </div>
      <div className="mt-1 h-3 w-32 rounded bg-gray-200" />
      <div className="mt-2 h-4 w-40 rounded bg-gray-200" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AuditResultsPageContent({
  loading,
  items,
  total,
  category,
  selectedAuditId,
  currentPage,
  totalPages,
  onCategoryChange,
  onSelectAudit,
  onPageChange,
}: {
  loading: boolean;
  items: AccountAuditResultListItem[];
  total: number;
  category: CategoryTab;
  selectedAuditId: string | null;
  currentPage: number;
  totalPages: number;
  onCategoryChange: (category: CategoryTab) => void;
  onSelectAudit: (auditId: string) => void;
  onPageChange: (page: number) => void;
}) {
  const activeCategoryLabel = CATEGORY_TABS.find((t) => t.id === category)?.label ?? "";
  const activeCategoryLabelLowercase =
    typeof activeCategoryLabel === "string" ? activeCategoryLabel.toLowerCase() : "category";

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Audit Results</h1>
        </div>
        {/* Mobile: active category name */}
        <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
          {activeCategoryLabel}
        </p>
        {/* Desktop: short description */}
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          View your completed customer service and compliance audit results.
        </p>
      </div>

      <ViewToggle
        options={CATEGORY_TABS}
        activeId={category}
        onChange={onCategoryChange}
        layoutId="audit-category-tabs"
      />

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <AuditResultSkeleton key={i} />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <ClipboardList className="h-4 w-4 shrink-0 text-gray-300" />
          <p className="text-sm text-gray-400">
            {category === 'all'
              ? 'No completed audit results found.'
              : `No completed ${activeCategoryLabelLowercase} results found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((audit) => (
            <AccountAuditResultCard
              key={audit.id}
              audit={audit}
              selected={audit.id === selectedAuditId}
              onSelect={() => onSelectAudit(audit.id)}
            />
          ))}

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}
