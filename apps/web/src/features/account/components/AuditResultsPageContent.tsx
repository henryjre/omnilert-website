import React from 'react';
import type { AccountAuditResultListItem } from '@omnilert/shared';
import { ClipboardList } from 'lucide-react';
import { Pagination } from '../../../shared/components/ui/Pagination';
import { AccountAuditResultCard } from './AccountAuditResultCard';

function AuditResultSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-4 w-48 rounded bg-gray-200" />
        </div>
        <div className="h-3 w-32 rounded bg-gray-200" />
      </div>
      <div className="mt-2 flex justify-between gap-3">
        <div className="h-3 w-36 rounded bg-gray-200" />
        <div className="h-3 w-28 rounded bg-gray-200" />
      </div>
    </div>
  );
}

export function AuditResultsPageContent({
  loading,
  items,
  total,
  selectedAuditId,
  currentPage,
  totalPages,
  onSelectAudit,
  onPageChange,
}: {
  loading: boolean;
  items: AccountAuditResultListItem[];
  total: number;
  selectedAuditId: string | null;
  currentPage: number;
  totalPages: number;
  onSelectAudit: (auditId: string) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Audit Results</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          View your completed audit results.
        </p>
      </div>

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
            No completed audits found.
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
