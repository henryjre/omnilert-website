import { useMemo } from 'react';
import { Wallet, ReceiptText } from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { TokenBalanceCard } from './TokenBalanceCard';
import { TokenTransactionFeed, type TokenTransaction } from './TokenTransactionFeed';

interface TokenPayPageContentProps {
  currentPage: number;
  onPageChange: (page: number) => void;
  selectedTransactionId?: string | null;
  onSelectTransaction?: (tx: import('./TokenTransactionFeed').TokenTransaction) => void;
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
  date.setDate(date.getDate() - Math.floor(Math.random() * 60));
  date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

  return {
    id: `tx-${1000 + i}`,
    type: (isCredit ? 'credit' : 'debit') as TokenTransaction['type'],
    title,
    category: (isCredit ? 'reward' : 'purchase') as TokenTransaction['category'],
    amount,
    date: date.toISOString(),
    reference: Math.random() > 0.3 ? `REF-${Math.floor(Math.random() * 90000) + 10000}` : undefined,
    status: (i < 2 ? 'pending' : 'completed') as TokenTransaction['status'],
  };
}).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const PAGE_SIZE = 10;

const pageVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.05 },
  },
};

const sectionVariant: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

export function TokenPayPageContent({
  currentPage,
  onPageChange,
  selectedTransactionId,
  onSelectTransaction,
}: TokenPayPageContentProps) {
  const totalPages = Math.ceil(MOCK_TRANSACTIONS.length / PAGE_SIZE);
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return MOCK_TRANSACTIONS.slice(start, start + PAGE_SIZE);
  }, [currentPage]);

  return (
    <motion.div
      className="space-y-5 sm:space-y-8"
      variants={pageVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={sectionVariant}>
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Token Pay</h1>
        </div>
        {/* Hide description on mobile to save vertical space */}
        <p className="mt-1.5 hidden text-sm text-gray-500 sm:block">
          View your balance, track recent activity, and manage your token pay.
        </p>
      </motion.div>

      {/* Balance card — has its own entrance animation internally */}
      <motion.div variants={sectionVariant}>
        <TokenBalanceCard balance={12543.50} />
      </motion.div>

      {/* Transaction history */}
      <motion.div variants={sectionVariant}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-semibold text-gray-900">Transaction History</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">Your most recent token pay activity.</p>
          </CardHeader>
          <CardBody className="p-4 sm:p-6">
            <TokenTransactionFeed
              items={currentItems}
              currentPage={currentPage}
              totalPages={totalPages}
              selectedId={selectedTransactionId}
              onPageChange={onPageChange}
              onSelect={onSelectTransaction}
            />
          </CardBody>
        </Card>
      </motion.div>
    </motion.div>
  );
}
