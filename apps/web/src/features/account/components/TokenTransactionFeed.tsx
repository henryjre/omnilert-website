import React from 'react';
import { ArrowDownRight, ArrowUpRight, ShoppingBag, Gift, Landmark, Clock } from 'lucide-react';
import { Pagination } from '../../../shared/components/ui/Pagination';

export type TransactionType = 'credit' | 'debit';

export interface TokenTransaction {
  id: string;
  type: TransactionType;
  title: string;
  category: 'reward' | 'purchase' | 'transfer' | 'adjustment';
  amount: number;
  date: string;
  reference?: string;
  status: 'completed' | 'pending' | 'failed';
}

interface TokenTransactionFeedProps {
  items: TokenTransaction[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function getIconForCategory(category: TokenTransaction['category'], type: TransactionType) {
  switch (category) {
    case 'reward': return <Gift className="h-5 w-5 text-[#4ade80]" />;
    case 'purchase': return <ShoppingBag className="h-5 w-5 text-gray-500" />;
    case 'transfer': return type === 'credit' ? <ArrowDownRight className="h-5 w-5 text-blue-500" /> : <ArrowUpRight className="h-5 w-5 text-amber-500" />;
    default: return <Landmark className="h-5 w-5 text-primary-500" />;
  }
}

export function TokenTransactionFeed({ items, currentPage, totalPages, onPageChange }: TokenTransactionFeedProps) {
  return (
    <div className="space-y-4">
      <div className="divide-y divide-gray-100">
        {items.map((tx) => {
          const isCredit = tx.type === 'credit';
          const isPending = tx.status === 'pending';
          const formattedAmount = `${isCredit ? '+' : '-'} ₱${Math.abs(tx.amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          
          return (
            <div key={tx.id} className={`group flex flex-col sm:flex-row sm:items-center justify-between py-4 transition-colors hover:bg-gray-50/50 -mx-2 px-3 rounded-xl cursor-default ${isPending ? 'opacity-70' : ''}`}>
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${isCredit ? 'border-green-100 bg-green-50' : 'border-gray-100 bg-gray-50'}`}>
                  {getIconForCategory(tx.category, tx.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900">{tx.title}</p>
                    {isPending && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                        <Clock className="h-3 w-3" />
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs font-medium text-gray-500">
                      {new Date(tx.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    {tx.reference && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-gray-300" />
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Ref: {tx.reference}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-left sm:mt-0 sm:text-right ml-16 sm:ml-0">
                <p className={`text-base font-bold tabular-nums tracking-tight ${isCredit ? 'text-[#16a34a]' : 'text-gray-900'}`}>
                  {formattedAmount}
                </p>
                <p className="text-xs font-semibold text-gray-400 mt-0.5 uppercase tracking-widest">{isCredit ? 'Received' : 'Spent'}</p>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="py-12 text-center text-sm font-medium text-gray-500">
            No transactions found.
          </div>
        )}
      </div>
      
      {totalPages > 1 && (
        <div className="pt-6 border-t border-gray-100">
           <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}
