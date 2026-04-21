import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { PayslipDetailResponse, PayslipListItem } from '@omnilert/shared';
import { Clock, FileEdit, FileText, X } from 'lucide-react';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useBranchStore } from '@/shared/store/branchStore';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { PayrollManagementCard } from './PayrollManagementCard';
import { PayrollManagementDetailPanel } from './PayrollManagementDetailPanel';

type StatusTab = 'pending' | 'draft';

const PAGE_SIZE = 10;
const STATUS_TABS: ViewOption<StatusTab>[] = [
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'draft', label: 'Draft', icon: FileEdit },
];

function CardSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="h-5 w-16 rounded-md bg-gray-200" />
        <div className="h-4 w-14 rounded bg-gray-200" />
      </div>
      <div className="mt-1.5 h-4 w-40 rounded bg-gray-200" />
      <div className="mt-1 flex items-center gap-1.5">
        <div className="h-3.5 w-3.5 shrink-0 rounded-full bg-gray-200" />
        <div className="h-4 w-48 rounded bg-gray-200" />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="h-3.5 w-36 rounded bg-gray-200" />
        <div className="h-3.5 w-20 rounded bg-gray-200" />
      </div>
    </div>
  );
}

export function PayrollOverviewTab() {
  const { error: showError } = useAppToast();
  const { selectedBranchIds, branches } = useBranchStore();

  const [allPayslips, setAllPayslips] = useState<PayslipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [page, setPage] = useState(1);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [selectedPayslipDetail, setSelectedPayslipDetail] = useState<PayslipDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    void api.get('/dashboard/payslips')
      .then((response) => {
        if (!active) return;
        const items = (response.data.data?.items ?? []) as PayslipListItem[];
        setAllPayslips(items.filter((p) => p.status === 'pending' || p.status === 'draft'));
      })
      .catch((err: unknown) => {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
        showError(axiosErr?.response?.data?.error ?? axiosErr?.response?.data?.message ?? 'Failed to load payroll records.');
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [showError]);

  useEffect(() => {
    if (!selectedPayslipId) {
      setSelectedPayslipDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    void api.get(`/dashboard/payslips/${encodeURIComponent(selectedPayslipId)}`)
      .then((response) => {
        if (!active) return;
        setSelectedPayslipDetail(response.data.data as PayslipDetailResponse);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
        showError(axiosErr?.response?.data?.error ?? axiosErr?.response?.data?.message ?? 'Failed to load payroll details.');
        setSelectedPayslipId(null);
      })
      .finally(() => { if (active) setDetailLoading(false); });

    return () => { active = false; };
  }, [selectedPayslipId, showError]);

  useEffect(() => { setPage(1); }, [statusTab, selectedBranchIds]);

  const selectedOdooCompanyIds = useMemo<Set<number>>(() => {
    const selectedSet = new Set(selectedBranchIds);
    return new Set(
      branches
        .filter((b) => selectedSet.has(b.id) && b.odoo_branch_id)
        .map((b) => Number(b.odoo_branch_id)),
    );
  }, [selectedBranchIds, branches]);

  const filteredPayslips = useMemo<PayslipListItem[]>(() => {
    let result = allPayslips.filter((p) => p.status === statusTab);
    if (selectedOdooCompanyIds.size > 0) {
      result = result.filter((p) => selectedOdooCompanyIds.has(p.company_id));
    }
    return result;
  }, [allPayslips, statusTab, selectedOdooCompanyIds]);

  const totalPages = Math.max(1, Math.ceil(filteredPayslips.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const paginatedPayslips = filteredPayslips.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const handleSelectPayslip = useCallback((id: string) => { setSelectedPayslipId(id); }, []);
  const handleTabChange = useCallback((tab: StatusTab) => {
    setStatusTab(tab);
    setSelectedPayslipId(null);
  }, []);
  const handleClosePanel = useCallback(() => {
    setSelectedPayslipId(null);
    setSelectedPayslipDetail(null);
  }, []);

  const panelOpen = Boolean(selectedPayslipId);
  const selectedPayslipMeta = allPayslips.find((p) => p.id === selectedPayslipId);

  return (
    <>
      <div className="space-y-4">
        <ViewToggle
          options={STATUS_TABS}
          activeId={statusTab}
          onChange={handleTabChange}
          layoutId="payroll-overview-status-tabs"
          className="max-w-sm"
        />

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : paginatedPayslips.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <FileText className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">No {statusTab} payroll records found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedPayslips.map((payslip) => (
              <PayrollManagementCard
                key={payslip.id}
                payslip={payslip}
                selected={payslip.id === selectedPayslipId}
                onSelect={handleSelectPayslip}
              />
            ))}
            {totalPages > 1 && (
              <div className="border-t border-gray-100 pt-4">
                <Pagination currentPage={clampedPage} totalPages={totalPages} onPageChange={setPage} />
              </div>
            )}
          </div>
        )}
      </div>

      {createPortal(
        <AnimatePresence>
          {panelOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={handleClosePanel}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col overflow-hidden bg-white shadow-2xl"
              >
                <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {selectedPayslipMeta ? selectedPayslipMeta.employee_name : 'Payroll Detail'}
                    </h2>
                    {selectedPayslipMeta && (
                      <p className="text-xs text-gray-500">
                        {selectedPayslipMeta.cutoff === 1 ? '1st' : '2nd'} Cutoff
                        {' · '}
                        {selectedPayslipMeta.company_name}
                        {' · '}
                        {selectedPayslipMeta.date_from} to {selectedPayslipMeta.date_to}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleClosePanel}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Close payroll detail"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <PayrollManagementDetailPanel detail={selectedPayslipDetail} loading={detailLoading} />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
