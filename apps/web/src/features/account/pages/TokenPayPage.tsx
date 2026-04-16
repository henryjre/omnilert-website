import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { TokenPayPageContent } from '../components/TokenPayPageContent';
import { TokenTransactionDetailPanel } from '../components/TokenTransactionDetailPanel';
import type { TokenTransaction } from '@omnilert/shared';

export function TokenPayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = Number(searchParams.get('page')) || 1;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [selectedTx, setSelectedTx] = useState<TokenTransaction | null>(null);

  // Sync page to URL
  useEffect(() => {
    if (currentPage > 1) {
      setSearchParams((prev) => {
        prev.set('page', currentPage.toString());
        return prev;
      }, { replace: true });
    } else {
      setSearchParams((prev) => {
        prev.delete('page');
        return prev;
      }, { replace: true });
    }
  }, [currentPage, setSearchParams]);

  // Sync URL to page (for back/forward navigation)
  // Note: currentPage intentionally excluded — this effect only reacts to external URL changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pageFromUrl = Number(searchParams.get('page')) || 1;
    if (pageFromUrl !== currentPage) {
      setCurrentPage(pageFromUrl);
    }
  }, [searchParams]);

  const handleClosePanel = () => setSelectedTx(null);

  return (
    <>
      <TokenPayPageContent
        currentPage={currentPage}
        onPageChange={(page) => {
          setCurrentPage(page);
          setSelectedTx(null);
        }}
        selectedTransactionId={selectedTx?.id ?? null}
        onSelectTransaction={(tx) => {
          // Toggle off if clicking the same row
          setSelectedTx((prev) => (prev?.id === tx.id ? null : tx));
        }}
      />

      {createPortal(
        <AnimatePresence>
          {selectedTx && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={handleClosePanel}
              />

              {/* Side panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl"
              >
                {/* Panel header */}
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Transaction Detail</h2>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {selectedTx.reference || selectedTx.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClosePanel}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Close transaction detail"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Panel body */}
                <TokenTransactionDetailPanel tx={selectedTx} />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
