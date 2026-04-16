import { useCallback, useEffect, useState } from 'react';
import { TrendingDown, TrendingUp, X } from 'lucide-react';
import { PERMISSIONS } from '@omnilert/shared';
import type { TokenPayCardSummary, TokenTransaction } from '@omnilert/shared';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { TokenTransactionFeed } from '@/features/account/components/TokenTransactionFeed';
import {
  fetchWalletDetail,
  suspendAccount,
  unsuspendAccount,
} from '../services/tokenPayManagement.api';

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

function formatCurrency(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface TokenPayWalletDetailPanelProps {
  wallet: TokenPayCardSummary;
  onClose: () => void;
  onSuspendChange: () => void;
}

export function TokenPayWalletDetailPanel({
  wallet,
  onClose,
  onSuspendChange,
}: TokenPayWalletDetailPanelProps) {
  const { hasPermission } = usePermission();
  const { success: showSuccess, error: showError } = useAppToast();

  const canManage = hasPermission(PERMISSIONS.TOKEN_PAY_ACCOUNT_MANAGE);

  // Live balance/totals — synced from detail fetch
  const [liveBalance, setLiveBalance] = useState(wallet.balance);
  const [liveTotalEarned, setLiveTotalEarned] = useState(wallet.totalEarned);
  const [liveTotalSpent, setLiveTotalSpent] = useState(wallet.totalSpent);
  const [liveTotalDeducted, setLiveTotalDeducted] = useState(wallet.totalDeducted);

  // Sync if parent re-renders with updated wallet prop
  useEffect(() => {
    setLiveBalance(wallet.balance);
    setLiveTotalEarned(wallet.totalEarned);
    setLiveTotalSpent(wallet.totalSpent);
    setLiveTotalDeducted(wallet.totalDeducted);
  }, [wallet.balance, wallet.totalEarned, wallet.totalSpent, wallet.totalDeducted]);

  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txLoading, setTxLoading] = useState(false);

  const [suspendLoading, setSuspendLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadTransactions = useCallback(
    async (page: number) => {
      setTxLoading(true);
      try {
        const result = await fetchWalletDetail(wallet.userId, page, 10);
        setTransactions(result.transactions.items as TokenTransaction[]);
        setTxTotalPages(result.transactions.pagination.totalPages);
        setLiveBalance(result.wallet.balance);
        setLiveTotalEarned(result.wallet.totalEarned);
        setLiveTotalSpent(result.wallet.totalSpent);
        setLiveTotalDeducted(result.wallet.totalDeducted);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to load transactions';
        showError(message);
      } finally {
        setTxLoading(false);
      }
    },
    [wallet.userId, showError],
  );

  useEffect(() => {
    setTxPage(1);
    void loadTransactions(1);
  }, [loadTransactions]);

  const handlePageChange = useCallback(
    (page: number) => {
      setTxPage(page);
      void loadTransactions(page);
    },
    [loadTransactions],
  );

  const handleSuspendToggle = async () => {
    setSuspendLoading(true);
    setShowConfirm(false);
    try {
      if (wallet.isSuspended) {
        await unsuspendAccount(wallet.userId);
        showSuccess(`${wallet.firstName} ${wallet.lastName}'s account has been unsuspended.`);
      } else {
        await suspendAccount(wallet.userId);
        showSuccess(`${wallet.firstName} ${wallet.lastName}'s account has been suspended.`);
      }
      onSuspendChange();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Action failed. Please try again.';
      showError(message);
    } finally {
      setSuspendLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Wallet Detail</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close panel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Hero: gradient profile header */}
        <div
          className="relative px-6 pb-6 pt-8 text-center"
          style={{
            background: wallet.isSuspended
              ? 'linear-gradient(135deg, #374151 0%, #6b7280 100%)'
              : 'linear-gradient(135deg, rgb(30 64 175) 0%, rgb(37 99 235) 100%)',
          }}
        >
          {/* Avatar — large, centered */}
          <div className="flex justify-center">
            {wallet.avatarUrl ? (
              <img
                src={wallet.avatarUrl}
                alt={`${wallet.firstName} ${wallet.lastName}`}
                className="h-20 w-20 rounded-full object-cover ring-4 ring-white/20"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-2xl font-bold text-white ring-4 ring-white/20">
                {getInitials(wallet.firstName, wallet.lastName)}
              </div>
            )}
          </div>

          {/* Name + suspended pill */}
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <p className="text-xl font-bold text-white">
              {wallet.firstName} {wallet.lastName}
            </p>
            <p className="font-mono text-xs text-white/50">{wallet.userKey}</p>
            {wallet.isSuspended && (
              <span className="mt-0.5 rounded-full bg-red-500/80 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                Suspended
              </span>
            )}
          </div>

          {/* Balance — centered, prominent */}
          <div className="mt-5 rounded-xl bg-white/10 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-white/60">
              Current Balance
            </p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums text-white">
              {formatCurrency(liveBalance)}
            </p>
          </div>

          {/* Earned / Spent / Deducted — inline within gradient */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-2">
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-green-300" />
              <div className="text-left">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">Earned</p>
                <p className="text-sm font-bold tabular-nums text-white">{formatCurrency(liveTotalEarned)}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-2">
              <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-300" />
              <div className="text-left">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">Spent</p>
                <p className="text-sm font-bold tabular-nums text-white">{formatCurrency(liveTotalSpent)}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-2">
              <TrendingDown className="h-3.5 w-3.5 shrink-0 text-orange-300" />
              <div className="text-left">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">Deducted</p>
                <p className="text-sm font-bold tabular-nums text-white">{formatCurrency(liveTotalDeducted)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Transactions */}
        <div className="flex-1 px-6 py-5">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Transactions
          </h3>
          {txLoading && transactions.length === 0 ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : (
            <TokenTransactionFeed
              items={transactions}
              currentPage={txPage}
              totalPages={txTotalPages}
              isLoading={txLoading}
              onPageChange={handlePageChange}
            />
          )}
        </div>
      </div>

      {/* Footer action */}
      {canManage && (
        <div className="border-t border-gray-200 px-6 py-4">
          {wallet.isSuspended ? (
            <Button
              type="button"
              variant="success"
              className="w-full"
              disabled={suspendLoading}
              onClick={() => setShowConfirm(true)}
            >
              {suspendLoading ? 'Processing…' : 'Unsuspend Account'}
            </Button>
          ) : (
            <Button
              type="button"
              variant="danger"
              className="w-full"
              disabled={suspendLoading}
              onClick={() => setShowConfirm(true)}
            >
              {suspendLoading ? 'Processing…' : 'Suspend Account'}
            </Button>
          )}
        </div>
      )}

      {/* Confirm dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">
                {wallet.isSuspended ? 'Unsuspend Account' : 'Suspend Account'}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">
                {wallet.isSuspended
                  ? `Re-enable token pay access for ${wallet.firstName} ${wallet.lastName}?`
                  : `Suspend token pay access for ${wallet.firstName} ${wallet.lastName}? They will not be able to earn or spend tokens while suspended.`}
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={wallet.isSuspended ? 'success' : 'danger'}
                onClick={() => void handleSuspendToggle()}
              >
                {wallet.isSuspended ? 'Unsuspend' : 'Suspend'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
