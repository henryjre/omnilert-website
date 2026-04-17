import { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { ChevronDown, Clock } from 'lucide-react';
import type { TokenTransaction } from '@omnilert/shared';

import { Pagination } from '../../../shared/components/ui/Pagination';

interface TokenTransactionFeedProps {
  items: TokenTransaction[];
  currentPage: number;
  totalPages: number;
  selectedId?: string | null;
  isLoading?: boolean;
  disableAccordion?: boolean;
  onPageChange: (page: number) => void;
  onSelect?: (tx: TokenTransaction) => void;
}

const STATUS_STYLES: Record<TokenTransaction['status'], string> = {
  completed: 'bg-green-50 text-green-700 ring-green-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  cancelled: 'bg-gray-50 text-gray-500 ring-gray-200',
};

const CATEGORY_LABEL: Record<TokenTransaction['category'], string> = {
  reward: 'Reward',
  purchase: 'Purchase',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
};

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
  disableAccordion = false,
  onPageChange,
  onSelect,
}: TokenTransactionFeedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <motion.div
        className="divide-y divide-gray-100"
        variants={listVariants}
        initial="hidden"
        animate="visible"
        key={currentPage}
      >
        {items.map((tx) => {
          const isCredit = tx.type === 'credit';
          const isPending = tx.status === 'pending';
          const isSelected = tx.id === selectedId;
          const isExpanded = tx.id === expandedId;
          const formattedAmount = `${isCredit ? '+' : '-'} ₱${Math.abs(tx.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          return (
            <motion.div key={tx.id} variants={rowVariants}>
              {/* Summary row */}
              <div
                onClick={() => {
                  if (!disableAccordion) setExpandedId(isExpanded ? null : tx.id);
                  onSelect?.(tx);
                }}
                className={`group relative grid grid-cols-[1fr_auto] items-start gap-x-3 rounded-xl py-4 pl-4 pr-3 transition-colors cursor-pointer ${
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
                        {new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(tx.date))}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right column: amount + chevron */}
                <div className="flex items-start gap-1.5 shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-bold tabular-nums tracking-tight sm:text-base ${isCredit ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                      {formattedAmount}
                    </p>
                    <p className={`mt-0.5 text-[10px] font-semibold uppercase tracking-widest ${isCredit ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                      {isCredit ? 'Received' : tx.category === 'adjustment' ? 'Deducted' : 'Spent'}
                    </p>
                  </div>
                  {!disableAccordion && (
                    <ChevronDown
                      className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  )}
                </div>
              </div>

              {/* Accordion detail */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="mx-4 mb-3 rounded-lg bg-gray-50 px-4 py-3 ring-1 ring-inset ring-gray-200">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
                        <div>
                          <dt className="font-medium uppercase tracking-wider text-gray-400">Category</dt>
                          <dd className="mt-0.5 font-semibold text-gray-700">{CATEGORY_LABEL[tx.category]}</dd>
                        </div>
                        <div>
                          <dt className="font-medium uppercase tracking-wider text-gray-400">Status</dt>
                          <dd className="mt-0.5">
                            <span className={`inline-flex rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${STATUS_STYLES[tx.status]}`}>
                              {tx.status}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium uppercase tracking-wider text-gray-400">Source</dt>
                          <dd className="mt-0.5 font-semibold capitalize text-gray-700">{tx.source}</dd>
                        </div>
                        {tx.issuedBy && (
                          <div>
                            <dt className="font-medium uppercase tracking-wider text-gray-400">Issued By</dt>
                            <dd className="mt-0.5 font-semibold text-gray-700">{tx.issuedBy}</dd>
                          </div>
                        )}
                        {tx.reference && (
                          <div className="col-span-2">
                            <dt className="font-medium uppercase tracking-wider text-gray-400">
                              {tx.category === 'adjustment' ? 'Adjustment Reason' : 'Reference'}
                            </dt>
                            <dd className={`mt-0.5 ${tx.category === 'adjustment' ? 'text-gray-700' : 'break-all font-mono text-[11px] text-gray-600'}`}>
                              {tx.reference}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
