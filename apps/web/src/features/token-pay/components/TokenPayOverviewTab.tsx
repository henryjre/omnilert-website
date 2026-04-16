import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Wallet } from 'lucide-react';
import type { TokenPayCardSummary } from '@omnilert/shared';
import { Input } from '@/shared/components/ui/Input';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { fetchAllWallets } from '../services/tokenPayManagement.api';
import { TokenPayWalletCard } from './TokenPayWalletCard';
import { TokenPayWalletDetailPanel } from './TokenPayWalletDetailPanel';

function WalletCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200" />
        <div className="flex-1 space-y-1.5 pt-1">
          <div className="h-4 w-28 rounded bg-gray-200" />
          <div className="h-3 w-20 rounded bg-gray-100" />
        </div>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
        <div className="h-3 w-16 rounded bg-gray-100" />
        <div className="h-7 w-32 rounded bg-gray-200" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="h-10 rounded-lg bg-gray-100" />
        <div className="h-10 rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}

export function TokenPayOverviewTab() {
  const { error: showError } = useAppToast();

  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState<TokenPayCardSummary[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const loadWallets = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const data = await fetchAllWallets();
        setWallets(data);
      } catch (err: unknown) {
        if (!options?.silent) {
          const message = err instanceof Error ? err.message : 'Failed to load wallets';
          showError(message);
        }
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  const filteredWallets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wallets;
    return wallets.filter(
      (w) =>
        `${w.firstName} ${w.lastName}`.toLowerCase().includes(q) ||
        w.userKey.toLowerCase().includes(q),
    );
  }, [wallets, search]);

  const selectedWallet = useMemo(
    () => wallets.find((w) => w.userId === selectedUserId) ?? null,
    [wallets, selectedUserId],
  );

  const handleSelectWallet = useCallback((userId: string) => {
    setSelectedUserId((prev) => (prev === userId ? null : userId));
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedUserId(null);
  }, []);

  const handleSuspendChange = useCallback(async () => {
    await loadWallets({ silent: true });
    setSelectedUserId(null);
  }, [loadWallets]);

  return (
    <>
      <div className="space-y-4">
        {/* Search bar */}
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or key…"
            className="pl-9"
          />
        </div>

        {/* Card grid */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <WalletCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredWallets.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Wallet className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">
              {search.trim() ? 'No wallets match your search.' : 'No wallets found.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredWallets.map((wallet) => (
              <TokenPayWalletCard
                key={wallet.userId}
                wallet={wallet}
                selected={selectedUserId === wallet.userId}
                onClick={handleSelectWallet}
              />
            ))}
          </div>
        )}
      </div>

      {/* Portaled slide-in panel */}
      {createPortal(
        <>
          <AnimatePresence>
            {selectedWallet && (
              <motion.div
                key="wallet-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={handleClosePanel}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedWallet && (
              <motion.div
                key={selectedWallet.userId}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] shadow-2xl"
              >
                <TokenPayWalletDetailPanel
                  wallet={selectedWallet}
                  onClose={handleClosePanel}
                  onSuspendChange={handleSuspendChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </>
  );
}
