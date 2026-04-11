import React, { useMemo } from 'react';
import { WalletCards } from 'lucide-react';
import { TokenBalanceCard } from './TokenBalanceCard';
import { TokenTransactionFeed, type TokenTransaction } from './TokenTransactionFeed';

interface TokenPayPageContentProps {
  currentPage: number;
  onPageChange: (page: number) => void;
}

// Generate some realistic mock data until the backend is integrated
const MOCK_TRANSACTIONS: TokenTransaction[] = Array.from({ length: 34 }).map((_, i) => {
  const isCredit = Math.random() > 0.4;
  const amount = isCredit ? Math.floor(Math.random() * 5000) + 100 : Math.floor(Math.random() * 2000) + 50;
  
  const creditTitles = ['EPI Performance Bonus', 'Shift Overtime Reward', 'Peer Evaluation Credit', 'Employee Milestone Bonus'];
  const debitTitles = ['Company Store Purchase', 'Lunch Deductions', 'Equipment Request Fee', 'Uniform deduction'];
  
  const title = isCredit 
    ? creditTitles[Math.floor(Math.random() * creditTitles.length)] 
    : debitTitles[Math.floor(Math.random() * debitTitles.length)];
    
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * 60)); // last 60 days
  date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));
  
  return {
    id: `tx-${1000 + i}`,
    type: isCredit ? 'credit' : 'debit',
    title,
    category: isCredit ? 'reward' : 'purchase',
    amount,
    date: date.toISOString(),
    reference: Math.random() > 0.3 ? `REF-${Math.floor(Math.random() * 90000) + 10000}` : undefined,
    status: i < 2 ? 'pending' : 'completed', // First few might be pending conceptually
  };
}).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const PAGE_SIZE = 10;

export function TokenPayPageContent({
  currentPage,
  onPageChange,
}: TokenPayPageContentProps) {
  
  const totalPages = Math.ceil(MOCK_TRANSACTIONS.length / PAGE_SIZE);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return MOCK_TRANSACTIONS.slice(start, start + PAGE_SIZE);
  }, [currentPage]);

  return (
    <div className="space-y-8">
      {/* Header aligned with AuditResultsPage format */}
      <div>
        <div className="flex items-center gap-2.5">
          <WalletCards className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">My Token Pay</h1>
        </div>
        <p className="mt-1.5 text-sm text-gray-500">
          Manage your digital tokens, view your current balance, and track recent transaction activity across the platform.
        </p>
      </div>

      <TokenBalanceCard balance={12543.50} />

      <div className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-sm ring-1 ring-gray-900/5 sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-gray-900">Transaction History</h2>
            <p className="text-sm text-gray-500 mt-0.5">Your most recent credits and debits.</p>
          </div>
        </div>
        <TokenTransactionFeed 
          items={currentItems}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
