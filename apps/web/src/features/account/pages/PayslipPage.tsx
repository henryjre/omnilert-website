import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import type { PayslipDetailResponse, PayslipListItem, PayslipStatus } from '@omnilert/shared';
import { FileEdit, FileText, X } from 'lucide-react';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useBranchStore } from '@/shared/store/branchStore';
import { Spinner } from '@/shared/components/ui/Spinner';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import {
  authorizePayslipAdjustment,
  fetchPayslipAdjustmentDetail,
  fetchPayslipAdjustmentItems,
} from '@/features/payslips/services/payrollManagement.api';
import { PayslipAdjustmentDetailPanel } from '../components/PayslipAdjustmentDetailPanel';
import { PayslipAdjustmentListContent } from '../components/PayslipAdjustmentListContent';
import { PayslipListContent } from '../components/PayslipListContent';
import { PayslipDetailPanel } from '../components/PayslipDetailPanel';
import {
  type AdjustmentCategoryTab,
  type PayslipAdjustmentRecord,
  type PayslipAdjustmentStatus,
} from '../components/payslipAdjustments.shared';

type StatusFilter = 'all' | PayslipStatus;

const PAGE_SIZE = 10;
const SYNC_LIMIT = 200;

const CATEGORY_TABS: ViewOption<AdjustmentCategoryTab>[] = [
  { id: 'payslip', label: 'Payslip', icon: FileText },
  { id: 'adjustments', label: 'Adjustments', icon: FileEdit },
];

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosErr = error as { response?: { data?: { error?: string; message?: string } } };
  return (
    axiosErr?.response?.data?.error ??
    axiosErr?.response?.data?.message ??
    (error instanceof Error ? error.message : fallback)
  );
}

export function PayslipPage() {
  const { error: showError, success: showSuccess } = useAppToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const { selectedBranchIds, branches, loading: branchesLoading } = useBranchStore();

  const [categoryTab, setCategoryTab] = useState<AdjustmentCategoryTab>('payslip');
  const [allPayslips, setAllPayslips] = useState<PayslipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [selectedPayslipDetail, setSelectedPayslipDetail] = useState<PayslipDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [allAdjustments, setAllAdjustments] = useState<PayslipAdjustmentRecord[]>([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(true);
  const [adjustmentStatusFilter, setAdjustmentStatusFilter] = useState<PayslipAdjustmentStatus>('pending');
  const [adjustmentPage, setAdjustmentPage] = useState(1);
  const [selectedAdjustmentId, setSelectedAdjustmentId] = useState<string | null>(null);
  const [selectedAdjustmentDetail, setSelectedAdjustmentDetail] = useState<PayslipAdjustmentRecord | null>(null);
  const [adjustmentDetailLoading, setAdjustmentDetailLoading] = useState(false);
  const [adjustmentActionLoading, setAdjustmentActionLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchPayslips = async () => {
      setLoading(true);
      try {
        const response = await api.get('/dashboard/payslips');
        if (!active) return;
        const items = (response.data.data?.items ?? []) as PayslipListItem[];
        setAllPayslips(items);
      } catch (error: unknown) {
        if (!active) return;
        showError(getErrorMessage(error, 'Failed to load payslips.'));
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchPayslips();
    return () => {
      active = false;
    };
  }, [showError]);

  useEffect(() => {
    if (!selectedPayslipId) {
      setSelectedPayslipDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    void api
      .get(`/dashboard/payslips/${encodeURIComponent(selectedPayslipId)}`)
      .then((response) => {
        if (!active) return;
        setSelectedPayslipDetail(response.data.data as PayslipDetailResponse);
      })
      .catch((error: unknown) => {
        if (!active) return;
        showError(getErrorMessage(error, 'Failed to load payslip details.'));
        setSelectedPayslipId(null);
        setSelectedPayslipDetail(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPayslipId, showError]);

  useEffect(() => {
    if (branchesLoading) return;
    if (branches.length === 0) {
      setAllAdjustments([]);
      setAdjustmentsLoading(false);
      return;
    }

    let cancelled = false;
    setAdjustmentsLoading(true);

    const selectedBranchIdSet = new Set(selectedBranchIds);
    const selectedBranches = branches.filter(
      (branch) => selectedBranchIdSet.size === 0 || selectedBranchIdSet.has(branch.id),
    );

    const branchIdsByCompany = new Map<string, string[]>();
    for (const branch of selectedBranches) {
      const companyBranchIds = branchIdsByCompany.get(branch.companyId) ?? [];
      companyBranchIds.push(branch.id);
      branchIdsByCompany.set(branch.companyId, companyBranchIds);
    }

    void (async () => {
      try {
        const results = await Promise.allSettled(
          Array.from(branchIdsByCompany.entries()).map(([companyId, branchIds]) =>
            fetchPayslipAdjustmentItems({
              companyId,
              branchIds,
              page: 1,
              limit: SYNC_LIMIT,
            }),
          ),
        );

        const merged: PayslipAdjustmentRecord[] = [];
        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          merged.push(...result.value.items);
        }

        const deduped = Array.from(
          new Map(merged.map((adjustment) => [adjustment.id, adjustment])).values(),
        ).sort(
          (left, right) =>
            new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime(),
        );

        if (!cancelled) setAllAdjustments(deduped);
      } catch (error: unknown) {
        if (!cancelled) {
          showError(getErrorMessage(error, 'Failed to load payslip adjustments.'));
        }
      } finally {
        if (!cancelled) setAdjustmentsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchesLoading, branches, selectedBranchIds, showError]);

  useEffect(() => {
    if (!selectedAdjustmentId) {
      setSelectedAdjustmentDetail(null);
      return;
    }

    let active = true;
    setAdjustmentDetailLoading(true);

    const partial = allAdjustments.find((adjustment) => adjustment.id === selectedAdjustmentId);

    void fetchPayslipAdjustmentDetail({
      companyId: partial?.companyId,
      targetId: selectedAdjustmentId,
    })
      .then((detail) => {
        if (!active) return;
        setSelectedAdjustmentDetail(detail);
        setAdjustmentStatusFilter(detail.status);
      })
      .catch((error: unknown) => {
        if (!active) return;
        showError(getErrorMessage(error, 'Failed to load payslip adjustment details.'));
        setSelectedAdjustmentId(null);
        setSelectedAdjustmentDetail(null);
      })
      .finally(() => {
        if (active) setAdjustmentDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [allAdjustments, selectedAdjustmentId, showError]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, selectedBranchIds]);

  useEffect(() => {
    setAdjustmentPage(1);
    setSelectedAdjustmentId(null);
    setSelectedAdjustmentDetail(null);
  }, [adjustmentStatusFilter, selectedBranchIds]);

  useEffect(() => {
    if (categoryTab !== 'payslip') {
      setSelectedPayslipId(null);
      setSelectedPayslipDetail(null);
    }
    if (categoryTab !== 'adjustments') {
      setSelectedAdjustmentId(null);
      setSelectedAdjustmentDetail(null);
    }
  }, [categoryTab]);

  useEffect(() => {
    const adjustmentId = searchParams.get('adjustmentId');
    const tabParam = searchParams.get('tab');

    if (adjustmentId && !branchesLoading) {
      setCategoryTab('adjustments');
      setSelectedAdjustmentId(adjustmentId);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('adjustmentId');
          next.delete('tab');
          return next;
        },
        { replace: true },
      );
      return;
    }

    if (tabParam === 'adjustments') {
      setCategoryTab('adjustments');
    } else if (tabParam === 'payslip') {
      setCategoryTab('payslip');
    }
    if (tabParam) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('tab');
          return next;
        },
        { replace: true },
      );
    }
  }, [branchesLoading, searchParams, setSearchParams]);

  const branchLabel = useMemo(() => {
    if (branches.length === 0) return '';
    const selectedBranches = branches.filter((branch) => selectedBranchIds.includes(branch.id));
    if (selectedBranches.length === 0 || selectedBranches.length === branches.length) {
      return 'All Branches';
    }
    if (selectedBranches.length === 1) return selectedBranches[0].name;
    return `${selectedBranches[0].name} +${selectedBranches.length - 1} more`;
  }, [branches, selectedBranchIds]);

  const selectedOdooCompanyIds = useMemo<Set<number>>(() => {
    const selectedSet = new Set(selectedBranchIds);
    const ids = branches
      .filter((branch) => selectedSet.has(branch.id) && branch.odoo_branch_id)
      .map((branch) => Number(branch.odoo_branch_id));
    return new Set(ids);
  }, [selectedBranchIds, branches]);

  const filteredPayslips = useMemo<PayslipListItem[]>(() => {
    let result = allPayslips;

    if (selectedOdooCompanyIds.size > 0) {
      result = result.filter((payslip) => selectedOdooCompanyIds.has(payslip.company_id));
    }

    if (statusFilter !== 'all') {
      result = result.filter((payslip) => payslip.status === statusFilter);
    }

    return result.filter((payslip) => payslip.net_pay !== 0);
  }, [allPayslips, selectedOdooCompanyIds, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPayslips.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const paginatedPayslips = filteredPayslips.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  const filteredAdjustments = useMemo(
    () =>
      allAdjustments.filter((adjustment) => adjustment.status === adjustmentStatusFilter),
    [allAdjustments, adjustmentStatusFilter],
  );

  const adjustmentTotalPages = Math.max(1, Math.ceil(filteredAdjustments.length / PAGE_SIZE));
  const clampedAdjustmentPage = Math.min(
    Math.max(adjustmentPage, 1),
    adjustmentTotalPages,
  );
  const paginatedAdjustments = filteredAdjustments.slice(
    (clampedAdjustmentPage - 1) * PAGE_SIZE,
    clampedAdjustmentPage * PAGE_SIZE,
  );

  const handleAuthorizeAdjustment = async () => {
    if (!selectedAdjustmentDetail) return;

    setAdjustmentActionLoading(true);
    try {
      await authorizePayslipAdjustment({
        companyId: selectedAdjustmentDetail.companyId,
        targetId: selectedAdjustmentDetail.id,
      });
      showSuccess('Payroll adjustment authorized.');
      setSelectedAdjustmentId(null);
      setSelectedAdjustmentDetail(null);

      const selectedBranchIdSet = new Set(selectedBranchIds);
      const selectedBranches = branches.filter(
        (branch) => selectedBranchIdSet.size === 0 || selectedBranchIdSet.has(branch.id),
      );
      const branchIdsByCompany = new Map<string, string[]>();
      for (const branch of selectedBranches) {
        const companyBranchIds = branchIdsByCompany.get(branch.companyId) ?? [];
        companyBranchIds.push(branch.id);
        branchIdsByCompany.set(branch.companyId, companyBranchIds);
      }

      const results = await Promise.allSettled(
        Array.from(branchIdsByCompany.entries()).map(([companyId, branchIds]) =>
          fetchPayslipAdjustmentItems({
            companyId,
            branchIds,
            page: 1,
            limit: SYNC_LIMIT,
          }),
        ),
      );

      const merged: PayslipAdjustmentRecord[] = [];
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        merged.push(...result.value.items);
      }

      const deduped = Array.from(
        new Map(merged.map((adjustment) => [adjustment.id, adjustment])).values(),
      ).sort(
        (left, right) =>
          new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime(),
      );

      setAllAdjustments(deduped);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to authorize payroll adjustment.'));
    } finally {
      setAdjustmentActionLoading(false);
    }
  };

  const containerVariant: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } };
  const sectionVariant: Variants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } };

  const panelOpen = Boolean(selectedPayslipId);
  const adjustmentPanelOpen = Boolean(selectedAdjustmentId);
  return (
    <motion.div className="space-y-5" initial="hidden" animate="visible" variants={containerVariant}>
      <motion.div variants={sectionVariant}>
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Payslip</h1>
          {branchLabel ? (
            <span className="mt-1 hidden text-sm font-medium text-primary-600 sm:inline">
              {branchLabel}
            </span>
          ) : null}
        </div>
        {branchLabel ? (
          <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
            {branchLabel}
          </p>
        ) : null}
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          {categoryTab === 'payslip'
            ? 'View your payslip history. Click a card to see the full breakdown.'
            : 'Review payroll adjustments awaiting your authorization or already in progress.'}
        </p>
      </motion.div>

      <motion.div variants={sectionVariant}>
      <ViewToggle
        options={CATEGORY_TABS}
        activeId={categoryTab}
        onChange={setCategoryTab}
        layoutId="payslip-category-tabs"
        showLabelOnMobile
      />
      </motion.div>

      <motion.div variants={sectionVariant}>
      {categoryTab === 'payslip' ? (
        <PayslipListContent
          loading={loading || branchesLoading}
          items={paginatedPayslips}
          total={filteredPayslips.length}
          statusFilter={statusFilter}
          selectedPayslipId={selectedPayslipId}
          currentPage={clampedPage}
          totalPages={totalPages}
          onStatusFilterChange={setStatusFilter}
          onSelectPayslip={setSelectedPayslipId}
          onPageChange={setPage}
        />
      ) : (
        <PayslipAdjustmentListContent
          loading={adjustmentsLoading || branchesLoading}
          items={paginatedAdjustments}
          total={filteredAdjustments.length}
          statusFilter={adjustmentStatusFilter}
          selectedAdjustmentId={selectedAdjustmentId}
          currentPage={clampedAdjustmentPage}
          totalPages={adjustmentTotalPages}
          onStatusFilterChange={setAdjustmentStatusFilter}
          onSelectAdjustment={setSelectedAdjustmentId}
          onPageChange={setAdjustmentPage}
        />
      )}
      </motion.div>

      {createPortal(
        <>
          <AnimatePresence>
            {panelOpen ? (
              <motion.div
                key="payslip-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={() => {
                  setSelectedPayslipId(null);
                  setSelectedPayslipDetail(null);
                }}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {panelOpen ? (
              <motion.div
                key={selectedPayslipId}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] shadow-2xl"
              >
                <div className="flex h-full flex-col bg-white">
                  <div className="flex items-center justify-end border-b border-gray-200 px-6 py-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPayslipId(null);
                        setSelectedPayslipDetail(null);
                      }}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Close payslip detail"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <PayslipDetailPanel loading={detailLoading} detail={selectedPayslipDetail} />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {adjustmentPanelOpen ? (
              <motion.div
                key="payslip-adjustment-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={() => {
                  setSelectedAdjustmentId(null);
                  setSelectedAdjustmentDetail(null);
                }}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {adjustmentPanelOpen ? (
              <motion.div
                key={selectedAdjustmentId}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] shadow-2xl"
              >
                {adjustmentDetailLoading || !selectedAdjustmentDetail ? (
                  <div className="flex h-full items-center justify-center bg-white">
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <Spinner size="sm" />
                      Loading payroll adjustment...
                    </div>
                  </div>
                ) : (
                  <PayslipAdjustmentDetailPanel
                    adjustment={selectedAdjustmentDetail}
                    actionLoading={adjustmentActionLoading}
                    onClose={() => {
                      setSelectedAdjustmentId(null);
                      setSelectedAdjustmentDetail(null);
                    }}
                    onAuthorize={
                      selectedAdjustmentDetail.status === 'pending'
                        ? handleAuthorizeAdjustment
                        : undefined
                    }
                  />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </motion.div>
  );
}
