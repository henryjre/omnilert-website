import { motion, type Variants } from 'framer-motion';
import { Clock } from 'lucide-react';
import type { TokenTransaction } from '@omnilert/shared';

import { Pagination } from '../../../shared/components/ui/Pagination';

interface TokenTransactionFeedProps {
  items: TokenTransaction[];
  currentPage: number;
  totalPages: number;
  selectedId?: string | null;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onSelect?: (tx: TokenTransaction) => void;
}


const listVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.05 },
  },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.32, ease: 'easeOut' },
  },
};

export function TokenTransactionFeed({
  items,
  currentPage,
  totalPages,
  selectedId,
  isLoading = false,
  onPageChange,
  onSelect,
}: TokenTransactionFeedProps) {
  return (
    <div className="space-y-4">
      <motion.div
        className="divide-y divide-gray-100"
        variants={listVariants}
        initial="hidden"
        animate="visible"
        // Re-trigger stagger on page change by keying on currentPage
        key={currentPage}
      >
        {items.map((tx) => {
          const isCredit = tx.type === 'credit';
          const isPending = tx.status === 'pending';
          const isSelected = tx.id === selectedId;
          const formattedAmount = `${isCredit ? '+' : '-'} ₱${Math.abs(tx.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          return (
            <motion.div
              key={tx.id}
              variants={rowVariants}
              onClick={() => onSelect?.(tx)}
              className={`group relative grid grid-cols-[1fr_auto] items-start gap-x-3 rounded-xl py-4 pl-4 pr-3 transition-colors ${
                onSelect ? 'cursor-pointer' : 'cursor-default'
              } ${
                isSelected
                  ? 'bg-primary-50/60 ring-1 ring-inset ring-primary-200/60'
                  : 'hover:bg-gray-50/50'
              } ${isPending ? 'opacity-70' : ''}`}
            >
              {/* Left border accent */}
              <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full ${isCredit ? 'bg-green-400' : 'bg-red-400'}`} />

              {/* Left column: title + meta */}
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <p className="text-sm font-bold text-gray-900 leading-snug">{tx.title}</p>
                    {isPending && (
                      <>
                        <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500 sm:hidden" />
                        <span className="hidden rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-500 ring-1 ring-inset ring-amber-200 sm:inline">
                          Pending
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-1">
                    <p className="text-xs font-medium text-gray-500">
                      {new Date(tx.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right column: amount + label — always top-right */}
              <div className="shrink-0 text-right">
                <p className={`text-sm font-bold tabular-nums tracking-tight sm:text-base ${isCredit ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                  {formattedAmount}
                </p>
                <p className={`mt-0.5 text-[10px] font-semibold uppercase tracking-widest ${isCredit ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                  {isCredit ? 'Received' : 'Spent'}
                </p>
              </div>
            </motion.div>
          );
        })}

        {items.length === 0 && !isLoading && (
          <div className="py-12 text-center text-sm font-medium text-gray-500">
            No transactions found.
          </div>
        )}
        {isLoading && items.length === 0 && (
          <div className="py-12 text-center text-sm font-medium text-gray-400">
            Loading transactions…
          </div>
        )}
      </motion.div>

      {totalPages > 1 && (
        <div className="border-t border-gray-100 pt-6">
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}
