import React from 'react';
import type { AccountAuditResultListItem, StoreAuditType } from '@omnilert/shared';
import { ClipboardList, LayoutGrid, ShieldCheck, Star } from 'lucide-react';
import { Card, CardBody } from '../../../shared/components/ui/Card';
import { Spinner } from '../../../shared/components/ui/Spinner';
import { StoreAuditPaginationFooter } from '../../store-audits/components/StoreAuditPaginationFooter';
import { AccountAuditResultCard } from './AccountAuditResultCard';

type CategoryTab = 'all' | StoreAuditType;

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
  onPrevious,
  onNext,
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
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Audit Results</h1>
        </div>
      </div>

      <div className="flex justify-center gap-1 border-b border-gray-200 sm:justify-start">
        {([
          { key: 'all', label: 'All Categories', icon: LayoutGrid },
          { key: 'customer_service', label: 'Customer Service Audit', icon: Star },
          { key: 'compliance', label: 'Compliance Audit', icon: ShieldCheck },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onCategoryChange(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              category === tab.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : total === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <p className="text-sm text-gray-500">No completed audit results found.</p>
          </CardBody>
        </Card>
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

          {totalPages > 1 && (
            <StoreAuditPaginationFooter
              currentPage={currentPage}
              totalPages={totalPages}
              onPrevious={onPrevious}
              onNext={onNext}
            />
          )}
        </div>
      )}
    </div>
  );
}
