import { useEffect, useMemo, useRef, useState, memo } from 'react';
import type { ElementType } from 'react';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useSearchParams } from "react-router-dom";
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { CompanyBranchPicker } from '@/shared/components/CompanyBranchPicker';
import type { CompanyBranchValue } from '@/shared/components/CompanyBranchPicker';
import { ImageModal } from '@/features/pos-verification/components/ImageModal';
import { api } from '@/shared/services/api.client';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { PERMISSIONS } from '@omnilert/shared';
import {
  DollarSign, X, Plus, Paperclip, ChevronRight,
  LayoutGrid, Clock, CheckCircle, XCircle, Banknote,
  GitBranch, Calendar, AlertCircle, FileText,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'pending' | 'approved' | 'disbursed' | 'rejected';

type CashRequest = {
  id: string;
  company_id: string;
  user_id: string;
  branch_id: string;
  branch_name: string | null;
  request_type: string;
  reference: string | null;
  amount: string | number;
  reason: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  attachment_url: string | null;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUEST_TYPES = [
  { key: 'salary_wage_request',    label: 'Salary / Wage Request'    },
  { key: 'cash_advance_request',   label: 'Cash Advance Request'     },
  { key: 'expense_reimbursement',  label: 'Expense Reimbursement'    },
  { key: 'training_allowance',     label: 'Training Allowance'       },
  { key: 'transport_allowance',    label: 'Transport Allowance'      },
] as const;

type RequestTypeKey = (typeof REQUEST_TYPES)[number]['key'];

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning'> = {
  approved:  'success',
  disbursed: 'success',
  rejected:  'danger',
};

const STATUS_TABS: ViewOption<StatusFilter>[] = [
  { id: 'all',       label: 'All',       icon: LayoutGrid  },
  { id: 'pending',   label: 'Pending',   icon: Clock       },
  { id: 'approved',  label: 'Approved',  icon: CheckCircle },
  { id: 'disbursed', label: 'Disbursed', icon: Banknote    },
  { id: 'rejected',  label: 'Rejected',  icon: XCircle     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: string): 'success' | 'danger' | 'warning' {
  return STATUS_VARIANT[status] ?? 'warning';
}

function fmtAmount(amount: string | number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(amount));
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function resolveAttachmentUrl(url: string): string {
  return url.startsWith('http') ? url : `${import.meta.env.VITE_API_URL}${url}`;
}

// ─── Input helper ─────────────────────────────────────────────────────────────

const INPUT_CLS =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition-colors placeholder:text-gray-400 hover:border-primary-200 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200';
const LABEL_CLS = 'block text-sm font-medium text-gray-700';

// ─── Request Card Component ──────────────────────────────────────────────────

interface CashRequestCardProps {
  request: CashRequest;
  onClick: (id: string) => void;
}

const CashRequestCard = memo(({ request, onClick }: CashRequestCardProps) => {
  return (
    <button
      type="button"
      onClick={() => onClick(request.id)}
      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30 group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900 group-hover:text-primary-700 transition-colors">
            {REQUEST_TYPES.find((t) => t.key === request.request_type)?.label ?? request.request_type}
          </p>
          {request.branch_name && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
              <GitBranch className="h-3 w-3 shrink-0" />
              {request.branch_name}
            </p>
          )}
          <p className="mt-0.5 text-xs text-gray-400">{fmtDate(request.created_at)}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge variant={statusVariant(request.status)}>
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </Badge>
          <p className="text-sm font-semibold text-gray-800">{fmtAmount(request.amount)}</p>
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </button>
  );
});

CashRequestCard.displayName = 'CashRequestCard';

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CashRequestSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-40 rounded bg-gray-200" />
          <div className="h-3 w-28 rounded bg-gray-200" />
          <div className="h-3 w-20 rounded bg-gray-200" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-5 w-16 rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

// ─── New Request Modal ────────────────────────────────────────────────────────

interface NewRequestModalProps {
  onClose: () => void;
  onCreated: (request: CashRequest) => void;
}

function NewRequestModal({ onClose, onCreated }: NewRequestModalProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [step, setStep] = useState<'choose' | 'form'>('choose');
  const [selectedType, setSelectedType] = useState<RequestTypeKey | null>(null);
  const [branchValue, setBranchValue] = useState<CompanyBranchValue | null>(null);
  const [form, setForm] = useState({
    reference: '',
    amount: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isReimbursement = selectedType === 'expense_reimbursement';
  const selectedTypeLabel = REQUEST_TYPES.find((t) => t.key === selectedType)?.label ?? '';

  function setField(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType || !branchValue) {
      showErrorToast('Please select a branch before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('branchId',      branchValue.branchId);
      formData.append('requestType',   selectedType);
      formData.append('reference',     form.reference);
      formData.append('amount',        form.amount);
      formData.append('bankName',      form.bankName);
      formData.append('accountName',   form.accountName);
      formData.append('accountNumber', form.accountNumber);
      if (attachment) formData.append('attachment', attachment);

      const res = await api.post('/account/cash-requests', formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          "X-Company-Id": branchValue.companyId,
        },
      });
      onCreated(res.data.data as CashRequest);
      showSuccessToast('Cash request submitted.');
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
      showErrorToast(
        axiosErr?.response?.data?.error ??
        axiosErr?.response?.data?.message ??
        'Failed to submit request.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatedModal onBackdropClick={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900">
          {step === 'choose' ? 'New Cash Request' : selectedTypeLabel}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Step 1 — choose request type */}
      {step === 'choose' && (
        <div className="space-y-3 p-6">
          {REQUEST_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setSelectedType(t.key); setStep('form'); }}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50"
            >
              <DollarSign className="h-5 w-5 shrink-0 text-primary-600" />
              <p className="font-medium text-gray-900">{t.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 2 — branch + form */}
      {step === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Branch picker */}
          <CompanyBranchPicker
            label="Branch"
            value={branchValue}
            onChange={setBranchValue}
            placeholder="Select the branch for this request"
          />

          {/* Reference */}
          <div className="space-y-1">
            <label className={LABEL_CLS}>Reference</label>
            <input
              className={INPUT_CLS}
              placeholder="e.g. February 1st Cut Off - 0001"
              value={form.reference}
              onChange={setField('reference')}
              required
            />
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <label className={LABEL_CLS}>Requested Amount (PHP)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={INPUT_CLS}
              placeholder="0.00"
              value={form.amount}
              onChange={setField('amount')}
              required
            />
          </div>

          {/* Bank name */}
          <div className="space-y-1">
            <label className={LABEL_CLS}>Bank Name</label>
            <input
              className={INPUT_CLS}
              placeholder="e.g. BDO, BPI"
              value={form.bankName}
              onChange={setField('bankName')}
              required
            />
          </div>

          {/* Account name */}
          <div className="space-y-1">
            <label className={LABEL_CLS}>Account Name</label>
            <input
              className={INPUT_CLS}
              placeholder="Name on bank account"
              value={form.accountName}
              onChange={setField('accountName')}
              required
            />
          </div>

          {/* Account number */}
          <div className="space-y-1">
            <label className={LABEL_CLS}>Account Number</label>
            <input
              className={INPUT_CLS}
              placeholder="Bank account number"
              value={form.accountNumber}
              onChange={setField('accountNumber')}
              required
            />
          </div>

          {/* Attachment — required for expense reimbursement */}
          {isReimbursement && (
            <div className="space-y-1">
              <label className={LABEL_CLS}>
                Receipt Attachment <span className="text-red-500">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-xl border border-dashed border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-500 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-600"
              >
                <Paperclip className="h-4 w-4 shrink-0" />
                {attachment ? attachment.name : 'Click to upload receipt'}
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep('choose')}>
              Back
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={submitting || !branchValue}
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </Button>
          </div>
        </form>
      )}
    </AnimatedModal>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface CashRequestDetailPanelProps {
  request: CashRequest;
  loading: boolean;
  onClose: () => void;
  onViewAttachment: (url: string) => void;
}

function CashRequestDetailPanel({ request, loading, onClose, onViewAttachment }: CashRequestDetailPanelProps) {
  const typeLabel = REQUEST_TYPES.find((t) => t.key === request.request_type)?.label ?? request.request_type;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-primary-600" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">{typeLabel}</h2>
            <p className="text-xs text-gray-500">{fmtDate(request.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={statusVariant(request.status)}>
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </Badge>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Rejection reason callout */}
          {request.status === 'rejected' && request.rejection_reason && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
                <p className="mt-0.5 text-sm text-red-600">{request.rejection_reason}</p>
              </div>
            </div>
          )}

          {/* Branch */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Branch</h3>
            <div className="flex items-center gap-2 text-sm text-gray-800">
              <GitBranch className="h-4 w-4 shrink-0 text-gray-400" />
              <span>{request.branch_name ?? request.branch_id}</span>
            </div>
          </section>

          {/* Financial details */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Financial Details</h3>
            <dl className="space-y-3">
              {request.reference && (
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Reference</dt>
                    <dd className="text-sm font-medium text-gray-900">{request.reference}</dd>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Requested Amount</dt>
                  <dd className="text-sm font-semibold text-gray-900">{fmtAmount(request.amount)}</dd>
                </div>
              </div>
              {(request.bank_name ?? request.account_name ?? request.account_number) && (
                <div className="flex items-start gap-2">
                  <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Bank Account</dt>
                    <dd className="mt-0.5 space-y-0.5 text-sm text-gray-900">
                      {request.bank_name && <p>{request.bank_name}</p>}
                      {request.account_name && <p>{request.account_name}</p>}
                      {request.account_number && (
                        <p className="font-mono text-xs text-gray-600">{request.account_number}</p>
                      )}
                    </dd>
                  </div>
                </div>
              )}
              {request.attachment_url && (
                <div className="flex items-start gap-2">
                  <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Attachment</dt>
                    <dd className="mt-0.5">
                      <button
                        type="button"
                        onClick={() => onViewAttachment(resolveAttachmentUrl(request.attachment_url as string))}
                        className="text-sm font-medium text-primary-600 hover:underline"
                      >
                        View Receipt
                      </button>
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </section>

          {/* Timeline */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Timeline</h3>
            <dl className="space-y-3">
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Submitted</dt>
                  <dd className="text-sm text-gray-900">{fmtDate(request.created_at)}</dd>
                </div>
              </div>
              {request.reviewed_at && (
                <div className="flex items-start gap-2">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">
                      {request.status === 'rejected' ? 'Rejected' : 'Reviewed'} by
                    </dt>
                    <dd className="text-sm text-gray-900">
                      {request.reviewed_by_name ?? '—'}
                      <span className="ml-2 text-xs text-gray-500">{fmtDate(request.reviewed_at)}</span>
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function CashRequestsTab() {
  const PAGE_SIZE = 10;
  const [requests, setRequests] = useState<CashRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();

  /** Attachment preview */
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');

  /** Detail panel */
  const [selectedRequest, setSelectedRequest] = useState<CashRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const branches = useBranchStore((s) => s.branches);
  const branchesLoading = useBranchStore((s) => s.loading);
  const { hasPermission } = usePermission();
  const { error: showErrorToast } = useAppToast();
  const canSubmitCashRequest = hasPermission(PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST);

  useEffect(() => {
    /**
     * On hard reload, branches hydrate async and our API client only attaches X-Company-Id
     * once branches are loaded. If we fetch too early, the request can be scoped to the
     * user's "default" company and return an empty list, and we won't refetch.
     *
     * Fix: wait for branches to be available, then fetch for each selected company
     * (or all accessible companies when selection is empty) and merge results.
     */
    if (branchesLoading) return;
    if (branches.length === 0) return;

    let cancelled = false;
    setLoading(true);

    const selectedBranchIdSet = new Set(selectedBranchIds);
    const selectedCompanyIds = Array.from(
      new Set(
        branches
          .filter((b) => selectedBranchIdSet.size === 0 || selectedBranchIdSet.has(b.id))
          .map((b) => b.companyId),
      ),
    );

    void (async () => {
      try {
        const results = await Promise.allSettled(
          selectedCompanyIds.map((companyId) =>
            api.get("/account/cash-requests", {
              headers: { "X-Company-Id": companyId },
            }),
          ),
        );

        const merged: CashRequest[] = [];
        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const data = r.value.data?.data;
          const arr = Array.isArray(data) ? (data as CashRequest[]) : [];
          merged.push(...arr);
        }

        const uniqueById = new Map<string, CashRequest>();
        for (const req of merged) uniqueById.set(req.id, req);

        const deduped = Array.from(uniqueById.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

        if (!cancelled) setRequests(deduped);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
        if (!cancelled) {
          showErrorToast(
            axiosErr?.response?.data?.error ??
            axiosErr?.response?.data?.message ??
            "Failed to load cash requests.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [branchesLoading, branches, selectedBranchIds, showErrorToast]);

  /** Fetch full detail for the selected request. */
  const openDetail = async (id: string) => {
    setDetailLoading(true);
    const partial = requests.find((r) => r.id === id) ?? null;
    setSelectedRequest(partial);
    try {
      const companyId = partial?.company_id;
      const res = await api.get(
        `/account/cash-requests/${id}`,
        companyId ? { headers: { "X-Company-Id": companyId } } : undefined,
      );
      if (res.data?.data) {
        setSelectedRequest(res.data.data as CashRequest);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
      showErrorToast(
        axiosErr?.response?.data?.error ??
        axiosErr?.response?.data?.message ??
        'Failed to load request details.',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  // Deep-link: open the request detail panel when ?requestId= is present.
  // We remove the param immediately so back-navigation doesn't re-open the panel.
  useEffect(() => {
    const requestId = searchParams.get("requestId");
    if (!requestId) return;

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("requestId");
      return next;
    }, { replace: true });

    void openDetail(requestId);
    // openDetail is intentionally omitted to avoid re-running this effect on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /** Client-side branch + status filtering */
  const selectedBranchIdSet = useMemo(() => new Set(selectedBranchIds), [selectedBranchIds]);

  const filteredRequests = useMemo(() => {
    let result = requests;
    if (selectedBranchIdSet.size > 0) {
      result = result.filter((r) => selectedBranchIdSet.has(r.branch_id));
    }
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter);
    }
    return result;
  }, [requests, selectedBranchIdSet, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const pagedRequests = filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [statusFilter, selectedBranchIds]);
  useEffect(() => { setPage((prev) => Math.min(prev, totalPages)); }, [totalPages]);

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Cash Requests</h1>
        </div>
        <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
          {STATUS_TABS.find((t) => t.id === statusFilter)?.label}
        </p>
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Submit and track your salary, cash advance, and reimbursement requests.
        </p>
      </div>

      {/* Status tabs + New Request button */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <ViewToggle
          options={STATUS_TABS}
          activeId={statusFilter}
          onChange={(id) => {
            setStatusFilter(id);
            setPage(1);
          }}
          layoutId="cash-status-tabs"
          className="sm:flex-1"
        />

        {canSubmitCashRequest && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            New Request
          </button>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <NewRequestModal
            onClose={() => setShowModal(false)}
            onCreated={(req) => {
              setRequests((prev) => [req, ...prev]);
              setStatusFilter('all');
              setPage(1);
              // Keep the user's branch filter unchanged; open the new request immediately.
              void openDetail(req.id);
            }}
          />
        )}
      </AnimatePresence>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <CashRequestSkeleton key={i} />
          ))}
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <DollarSign className="h-4 w-4 shrink-0 text-gray-300" />
          <p className="text-sm text-gray-400">
            {statusFilter === 'all' ? 'No cash requests yet.' : `No ${statusFilter} requests found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pagedRequests.map((r) => (
            <CashRequestCard
              key={r.id}
              request={r}
              onClick={openDetail}
            />
          ))}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attachment image modal */}
      <ImageModal
        images={attachmentUrl ? [{ file_path: attachmentUrl }] : []}
        initialIndex={0}
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
      />

      {/* Detail panel — portalled so it escapes any stacking context */}
      {createPortal(
        <AnimatePresence>
          {selectedRequest && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={() => setSelectedRequest(null)}
              />

              {/* Slide-in panel */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col overflow-hidden bg-white shadow-2xl"
              >
                <CashRequestDetailPanel
                  request={selectedRequest}
                  loading={detailLoading}
                  onClose={() => setSelectedRequest(null)}
                  onViewAttachment={(url) => {
                    setAttachmentUrl(url);
                    setImageModalOpen(true);
                  }}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
