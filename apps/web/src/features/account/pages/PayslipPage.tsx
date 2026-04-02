import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { PayslipDetailResponse, PayslipListItem, PayslipStatus } from "@omnilert/shared";
import { X } from "lucide-react";
import { api } from "@/shared/services/api.client";
import { useAppToast } from "@/shared/hooks/useAppToast";
import { useBranchStore } from "@/shared/store/branchStore";
import { Spinner } from "@/shared/components/ui/Spinner";
import { PayslipListContent } from "../components/PayslipListContent";
import { PayslipDetailPanel } from "../components/PayslipDetailPanel";

type StatusFilter = "all" | PayslipStatus;

const PAGE_SIZE = 10;

/**
 * Payslip history page.
 *
 * - Fetches all payslips (including pending stubs for the current month)
 *   from GET /dashboard/payslips on mount.
 * - Uses the global BranchSelector state (useBranchStore) to filter payslips
 *   client-side by company — no page reload needed.
 * - Status tabs (All / Pending / Draft / Completed) further filter the list.
 * - Pagination is handled in-memory (10 per page).
 * - Clicking a card loads the full detail from GET /dashboard/payslips/:id
 *   and opens a slide-in side panel.
 */
export function PayslipPage() {
  const { error: showError } = useAppToast();

  // ----- Global branch selection state -----
  const { selectedBranchIds, branches } = useBranchStore();

  // ----- Page state -----
  const [allPayslips, setAllPayslips] = useState<PayslipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [selectedPayslipDetail, setSelectedPayslipDetail] = useState<PayslipDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ----- Fetch all payslips on mount -----
  useEffect(() => {
    let active = true;

    const fetchPayslips = async () => {
      setLoading(true);
      try {
        const response = await api.get("/dashboard/payslips");
        if (!active) return;
        const items = (response.data.data?.items ?? []) as PayslipListItem[];
        setAllPayslips(items);
      } catch (err: unknown) {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
        showError(
          axiosErr?.response?.data?.error ??
          axiosErr?.response?.data?.message ??
          "Failed to load payslips.",
        );
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchPayslips();
    return () => { active = false; };
  }, [showError]);

  // ----- Fetch detail when a card is selected -----
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
        showError(
          axiosErr?.response?.data?.error ??
          axiosErr?.response?.data?.message ??
          "Failed to load payslip details.",
        );
        setSelectedPayslipId(null);
        setSelectedPayslipDetail(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => { active = false; };
  }, [selectedPayslipId, showError]);

  // ----- Reset page when filter or branch selection changes -----
  useEffect(() => {
    setPage(1);
  }, [statusFilter, selectedBranchIds]);

  // ----- Derive the set of selected Odoo company IDs from selected branch IDs -----
  const selectedOdooCompanyIds = useMemo<Set<number>>(() => {
    const selectedSet = new Set(selectedBranchIds);
    const ids = branches
      .filter((b) => selectedSet.has(b.id) && b.odoo_branch_id)
      .map((b) => Number(b.odoo_branch_id));
    return new Set(ids);
  }, [selectedBranchIds, branches]);

  // ----- Filter and paginate in-memory -----
  const filteredPayslips = useMemo<PayslipListItem[]>(() => {
    let result = allPayslips;

    // Filter by branch
    if (selectedOdooCompanyIds.size > 0) {
      result = result.filter((p) => selectedOdooCompanyIds.has(p.company_id));
    }

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Exclude payslips with 0 net pay
    result = result.filter((p) => p.net_pay !== 0);

    return result;
  }, [allPayslips, selectedOdooCompanyIds, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPayslips.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const paginatedPayslips = filteredPayslips.slice(
    (clampedPage - 1) * PAGE_SIZE,
    clampedPage * PAGE_SIZE,
  );

  // ----- Handlers -----
  const handleSelectPayslip = (id: string) => {
    setSelectedPayslipId(id);
  };

  const handleClosePanel = () => {
    setSelectedPayslipId(null);
    setSelectedPayslipDetail(null);
  };

  const panelOpen = Boolean(selectedPayslipId);

  // Resolve the employee name for the panel header
  const selectedPayslipMeta = allPayslips.find((p) => p.id === selectedPayslipId);

  return (
    <>
      {/* Main content */}
      <PayslipListContent
        loading={loading}
        items={paginatedPayslips}
        total={filteredPayslips.length}
        statusFilter={statusFilter}
        selectedPayslipId={selectedPayslipId}
        currentPage={clampedPage}
        totalPages={totalPages}
        onStatusFilterChange={(filter) => {
          setStatusFilter(filter);
          setSelectedPayslipId(null);
        }}
        onSelectPayslip={handleSelectPayslip}
        onPageChange={setPage}
      />

      {/* Detail Panel via Portal */}
      {createPortal(
        <AnimatePresence>
          {panelOpen && (
            <>
              {/* Side panel backdrop */}
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
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col overflow-hidden bg-white shadow-2xl"
              >
                {/* Panel header */}
                <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {selectedPayslipMeta
                        ? `${selectedPayslipMeta.cutoff === 1 ? "1st" : "2nd"} Cutoff Payslip`
                        : "Payslip Detail"}
                    </h2>
                    {selectedPayslipMeta && (
                      <p className="text-xs text-gray-500">
                        {selectedPayslipMeta.company_name}
                        {" · "}
                        {selectedPayslipMeta.date_from} to {selectedPayslipMeta.date_to}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleClosePanel}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Close payslip detail"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Panel body */}
                {detailLoading && !selectedPayslipDetail ? (
                  <div className="flex flex-1 items-center justify-center">
                    <Spinner size="lg" />
                  </div>
                ) : (
                  <PayslipDetailPanel
                    detail={selectedPayslipDetail}
                    loading={detailLoading}
                  />
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
