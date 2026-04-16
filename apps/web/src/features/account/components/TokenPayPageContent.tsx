import { Wallet, ReceiptText } from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import type { TokenTransaction } from '@omnilert/shared';
import { Card, CardHeader, CardBody } from '@/shared/components/ui/Card';
import { TokenBalanceCard } from './TokenBalanceCard';
import { TokenTransactionFeed } from './TokenTransactionFeed';
import { fetchTokenPayWallet, fetchTokenPayTransactions } from '../services/tokenPay.api';

interface TokenPayPageContentProps {
  currentPage: number;
  onPageChange: (page: number) => void;
  selectedTransactionId?: string | null;
  onSelectTransaction?: (tx: TokenTransaction) => void;
}

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
  const walletQuery = useQuery({
    queryKey: ['token-pay-wallet'],
    queryFn: fetchTokenPayWallet,
  });

  const transactionsQuery = useQuery({
    queryKey: ['token-pay-transactions', currentPage],
    queryFn: () => fetchTokenPayTransactions(currentPage, 10),
  });

  const totalPages = transactionsQuery.data?.pagination.totalPages ?? 1;
  const currentItems: TokenTransaction[] = transactionsQuery.data?.data ?? [];

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
        <TokenBalanceCard
          balance={walletQuery.data?.balance ?? 0}
          totalEarned={walletQuery.data?.totalEarned ?? 0}
          totalSpent={walletQuery.data?.totalSpent ?? 0}
          totalDeducted={walletQuery.data?.totalDeducted ?? 0}
          isLoading={walletQuery.isLoading}
        />
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
              isLoading={transactionsQuery.isLoading}
              onPageChange={onPageChange}
              onSelect={onSelectTransaction}
            />
          </CardBody>
        </Card>
      </motion.div>
    </motion.div>
  );
}
