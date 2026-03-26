import { useEffect, useMemo, useState } from 'react';
import type { ElementType } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { useSearchParams } from "react-router-dom";
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { CompanyBranchPicker } from '@/shared/components/CompanyBranchPicker';
import type { CompanyBranchValue } from '@/shared/components/CompanyBranchPicker';
import { api } from '@/shared/services/api.client';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { PERMISSIONS } from '@omnilert/shared';
import {
  FileText, X, Plus, ChevronRight,
  LayoutGrid, Clock, CheckCircle, XCircle,
  GitBranch, Calendar, DollarSign, Landmark, AlertCircle,
  Copy, Check,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

type AuthRequest = {
  id: string;
  company_id: string;
  user_id: string;
  branch_id: string;
  branch_name: string | null;
  request_type: string;
  level: string;
  description: string | null;
  reference: string | null;
  requested_amount: string | number | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUEST_TYPE_LABELS: Record<string, string> = {
  payment_request: 'Payment Request',
  replenishment_request: 'Replenishment Request',
};

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning'> = {
  approved: 'success',
  rejected: 'danger',
};

const STATUS_TABS: { key: StatusFilter; label: string; Icon: ElementType }[] = [
  { key: 'all',      label: 'All',      Icon: LayoutGrid  },
  { key: 'pending',  label: 'Pending',  Icon: Clock       },
  { key: 'approved', label: 'Approved', Icon: CheckCircle },
  { key: 'rejected', label: 'Rejected', Icon: XCircle     },
];

const REQUEST_TYPES = [
  { value: 'payment_request',       label: 'Payment Request'       },
  { value: 'replenishment_request', label: 'Replenishment Request' },
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

/** Mirrors the slim metadata card while data is loading. */
function AuthRequestSkeleton() {
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
  onCreated: (req: AuthRequest) => void;
}

function NewRequestModal({ onClose, onCreated }: NewRequestModalProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const companyBranchGroups = useBranchStore((s) => s.companyBranchGroups);
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [requestType, setRequestType] = useState('');
  const [branchValue, setBranchValue] = useState<CompanyBranchValue | null>(null);
  const [form, setForm] = useState({
    reference: '',
    requestedAmount: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
  });
  const [submitting, setSubmitting] = useState(false);

  function handleTypeSelect(type: string) {
    setRequestType(type);
    setStep('form');
  }

  function setField(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!branchValue) {
      showErrorToast('Please select a branch before submitting.');
      return;
    }
    if (!form.reference || !form.requestedAmount || !form.bankName || !form.accountName || !form.accountNumber) {
      showErrorToast('All fields are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post(
        "/account/authorization-requests",
        {
          branchId: branchValue.branchId,
          requestType,
          level: "management",
          reference: form.reference,
          requestedAmount: parseFloat(form.requestedAmount),
          bankName: form.bankName,
          accountName: form.accountName,
          accountNumber: form.accountNumber,
        },
        {
          headers: {
            "X-Company-Id": branchValue.companyId,
          },
        },
      );
      const createdReq = res.data.data as AuthRequest;
      /**
       * The POST response may not include branch_name.
       * Look it up from the store using the branchId we just submitted,
       * so the newly prepended card shows the branch immediately.
       */
      if (!createdReq.branch_name) {
        const resolvedBranch = companyBranchGroups
          .flatMap((g) => g.branches.map((b) => ({ id: b.id, name: b.name, companyId: g.id })))
          .find((b) => b.id === branchValue.branchId && b.companyId === branchValue.companyId);
        if (resolvedBranch) {
          createdReq.branch_name = resolvedBranch.name;
        }
      }
      onCreated(createdReq);
      showSuccessToast('Authorization request submitted.');
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
          {step === 'type' ? 'New Authorization Request' : REQUEST_TYPE_LABELS[requestType]}
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
      {step === 'type' && (
        <div className="space-y-3 p-6">
          {REQUEST_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleTypeSelect(t.value)}
              className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50"
            >
              <FileText className="h-5 w-5 shrink-0 text-primary-600" />
              <p className="font-medium text-gray-900">{t.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 2 — select branch + fill in details */}
      {step === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {/* Branch picker — first field */}
          <CompanyBranchPicker
            label="Branch"
            value={branchValue}
            onChange={setBranchValue}
            placeholder="Select the branch for this request"
          />

          {(
            [
              { field: 'reference'       as const, label: 'Reference',        placeholder: 'Payment reference number' },
              { field: 'requestedAmount' as const, label: 'Requested Amount', placeholder: '0.00', type: 'number'    },
              { field: 'bankName'        as const, label: 'Bank Name',        placeholder: 'e.g. BDO, BPI'           },
              { field: 'accountName'     as const, label: 'Account Name',     placeholder: 'Name on bank account'    },
              { field: 'accountNumber'   as const, label: 'Account Number',   placeholder: 'Bank account number'     },
            ] satisfies Array<{ field: keyof typeof form; label: string; placeholder: string; type?: string }>
          ).map(({ field, label, placeholder, type }) => (
            <div key={field} className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">{label}</label>
              <input
                type={type ?? 'text'}
                placeholder={placeholder}
                value={form[field]}
                onChange={setField(field)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition-colors placeholder:text-gray-400 hover:border-primary-200 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200"
              />
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep('type')}>
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

interface AuthRequestDetailPanelProps {
  request: AuthRequest;
  loading: boolean;
  onClose: () => void;
}

function AuthRequestDetailPanel({ request, loading, onClose }: AuthRequestDetailPanelProps) {
  const typeLabel = REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type;
  const [copiedNumber, setCopiedNumber] = useState(false);

  /** Copy text to clipboard with an execCommand fallback for non-HTTPS dev environments. */
  function copyToClipboard(text: string) {
    const markCopied = () => {
      setCopiedNumber(true);
      setTimeout(() => setCopiedNumber(false), 2000);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(markCopied).catch(() => {
        fallbackCopy(text, markCopied);
      });
    } else {
      fallbackCopy(text, markCopied);
    }
  }

  function fallbackCopy(text: string, onSuccess: () => void) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    try {
      if (document.execCommand('copy')) onSuccess();
    } finally {
      document.body.removeChild(el);
    }
  }

  function copyAccountNumber() {
    if (!request.account_number) return;
    copyToClipboard(request.account_number);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary-600" />
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
              {request.requested_amount != null && (
                <div className="flex items-start gap-2">
                  <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Requested Amount</dt>
                    <dd className="text-sm font-semibold text-gray-900">{fmtAmount(request.requested_amount)}</dd>
                  </div>
                </div>
              )}
              {(request.bank_name ?? request.account_name ?? request.account_number) && (
                <div className="flex items-start gap-2">
                  <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Bank Account</dt>
                    <dd className="mt-0.5 space-y-0.5 text-sm text-gray-900">
                      {request.bank_name && <p>{request.bank_name}</p>}
                      {request.account_name && <p>{request.account_name}</p>}
                      {request.account_number && (
                        <div className="flex items-center gap-1.5">
                          <p className="font-mono text-xs text-gray-600">{request.account_number}</p>
                          <button
                            type="button"
                            onClick={copyAccountNumber}
                            className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            title="Copy account number"
                          >
                            {copiedNumber
                              ? <Check className="h-3.5 w-3.5 text-green-500" />
                              : <Copy className="h-3.5 w-3.5" />
                            }
                          </button>
                        </div>
                      )}
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
                      {request.status === 'rejected' ? 'Rejected' : 'Approved'} by
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

export function AuthorizationRequestsTab() {
  const PAGE_SIZE = 10;
  const [requests, setRequests] = useState<AuthRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();

  /** Detail panel state */
  const [selectedRequest, setSelectedRequest] = useState<AuthRequest | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const branches = useBranchStore((s) => s.branches);
  const branchesLoading = useBranchStore((s) => s.loading);
  const { hasPermission } = usePermission();
  const { error: showErrorToast } = useAppToast();
  const canSubmitPrivateRequest = hasPermission(PERMISSIONS.ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST);

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
            api.get("/account/authorization-requests", {
              headers: { "X-Company-Id": companyId },
            }),
          ),
        );

        const merged: AuthRequest[] = [];
        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const data = r.value.data?.data;
          const arr = Array.isArray(data) ? (data as AuthRequest[]) : [];
          merged.push(...arr);
        }

        const uniqueById = new Map<string, AuthRequest>();
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
            "Failed to load authorization requests.",
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
    // Optimistically show the partial data from the list while full data loads.
    const partial = requests.find((r) => r.id === id) ?? null;
    setSelectedRequest(partial);
    try {
      const companyId = partial?.company_id;
      const res = await api.get(
        `/account/authorization-requests/${id}`,
        companyId ? { headers: { "X-Company-Id": companyId } } : undefined,
      );
      setSelectedRequest(res.data.data as AuthRequest);
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

  /** Client-side branch + status filter. */
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

  /** Reset to page 1 whenever filter or branch selection changes. */
  useEffect(() => { setPage(1); }, [statusFilter, selectedBranchIds]);

  /** Keep current page within bounds when total shrinks. */
  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Authorization Requests</h1>
        </div>
        {/* Mobile: active tab name as a compact subtitle */}
        <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
          {STATUS_TABS.find((t) => t.key === statusFilter)?.label}
        </p>
        {/* Desktop: full description */}
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Submit and track your payment and replenishment requests.
        </p>
      </div>

      {/* Status tabs + New Request button */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex w-full gap-1 border-b border-gray-200 sm:flex-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
                statusFilter === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {canSubmitPrivateRequest && (
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

      {/* Modal — AnimatePresence enables exit animation */}
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

      {/* Content area */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <AuthRequestSkeleton key={i} />
          ))}
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <FileText className="h-4 w-4 shrink-0 text-gray-300" />
          <p className="text-sm text-gray-400">
            {statusFilter === 'all' ? 'No authorization requests yet.' : `No ${statusFilter} requests found.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pagedRequests.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => void openDetail(r.id)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30"
            >
              <div className="flex items-center justify-between gap-3">
                {/* Left: type, branch, date */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">
                    {REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}
                  </p>
                  {r.branch_name && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                      <GitBranch className="h-3 w-3 shrink-0" />
                      {r.branch_name}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-gray-400">{fmtDate(r.created_at)}</p>
                </div>

                {/* Right: status badge + amount + chevron */}
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge variant={statusVariant(r.status)}>
                    {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </Badge>
                  {r.requested_amount != null && (
                    <p className="text-sm font-semibold text-gray-800">
                      {fmtAmount(r.requested_amount)}
                    </p>
                  )}
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </div>
            </button>
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

      {/* Detail panel — portalled so it escapes any stacking context */}
      {createPortal(
        <>
          {/* Backdrop */}
          {selectedRequest && (
            <div
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => { setSelectedRequest(null); setDetailLoading(false); }}
            />
          )}

          {/* Slide-in panel */}
          <div
            className={`fixed inset-y-0 right-0 z-50 w-full max-w-[560px] transform bg-white shadow-2xl transition-transform duration-300 ${
              selectedRequest ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {selectedRequest && (
              <AuthRequestDetailPanel
                request={selectedRequest}
                loading={detailLoading}
                onClose={() => { setSelectedRequest(null); setDetailLoading(false); }}
              />
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
