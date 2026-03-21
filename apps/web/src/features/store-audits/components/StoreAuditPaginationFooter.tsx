import React from 'react';
import { Button } from '../../../shared/components/ui/Button';

type StoreAuditPaginationFooterProps = {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
};

export function StoreAuditPaginationFooter({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
}: StoreAuditPaginationFooterProps) {
  return (
    <div className="flex items-center justify-between text-sm text-gray-600">
      <span>
        Page {currentPage} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={currentPage <= 1}
          onClick={onPrevious}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={currentPage >= totalPages}
          onClick={onNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
