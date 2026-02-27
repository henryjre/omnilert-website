import { useEffect, useState } from 'react';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';
import { FileText, X, Plus } from 'lucide-react';

// --- Constants ---

const REQUEST_TYPE_LABELS: Record<string, string> = {
  payment_request: 'Payment Request',
  replenishment_request: 'Replenishment Request',
};

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning'> = {
  approved: 'success',
  rejected: 'danger',
};

function statusVariant(status: string) {
  return STATUS_VARIANT[status] ?? 'warning';
}

function fmtAmount(amount: string | number | null) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(amount));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// --- New Request Modal ---

const REQUEST_TYPES = [
  { value: 'payment_request', label: 'Payment Request' },
  { value: 'replenishment_request', label: 'Replenishment Request' },
];

interface NewRequestModalProps {
  onClose: () => void;
  onCreated: (req: any) => void;
  defaultBranchId?: string;
}

function NewRequestModal({ onClose, onCreated, defaultBranchId }: NewRequestModalProps) {
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [requestType, setRequestType] = useState('');
  const [form, setForm] = useState({
    reference: '',
    requestedAmount: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
    setError('');
    if (!defaultBranchId) {
      setError('No active branch selected. Please choose a branch from the top bar and try again.');
      return;
    }
    if (!form.reference || !form.requestedAmount || !form.bankName || !form.accountName || !form.accountNumber) {
      setError('All fields are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/account/authorization-requests', {
        branchId: defaultBranchId,
        requestType,
        level: 'management',
        reference: form.reference,
        requestedAmount: parseFloat(form.requestedAmount),
        bankName: form.bankName,
        accountName: form.accountName,
        accountNumber: form.accountNumber,
      });
      onCreated(res.data.data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {step === 'type' ? 'New Authorization Request' : REQUEST_TYPE_LABELS[requestType]}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step 1: Choose type */}
        {step === 'type' && (
          <div className="space-y-3 p-6">
            {REQUEST_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => handleTypeSelect(t.value)}
                className="flex w-full items-center gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50"
              >
                <FileText className="h-5 w-5 shrink-0 text-primary-600" />
                <div>
                  <p className="font-medium text-gray-900">{t.label}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Fill form */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {error && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
            {[
              { field: 'reference' as const, label: 'Reference', placeholder: 'Payment reference number' },
              { field: 'requestedAmount' as const, label: 'Requested Amount', placeholder: '0.00', type: 'number' },
              { field: 'bankName' as const, label: 'Bank Name', placeholder: 'e.g. BDO, BPI' },
              { field: 'accountName' as const, label: 'Account Name', placeholder: 'Name on bank account' },
              { field: 'accountNumber' as const, label: 'Account Number', placeholder: 'Bank account number' },
            ].map(({ field, label, placeholder, type }) => (
              <div key={field} className="space-y-1">
                <label className="text-xs font-medium text-gray-600">{label}</label>
                <input
                  type={type || 'text'}
                  placeholder={placeholder}
                  value={form[field]}
                  onChange={setField(field)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep('type')}>
                Back
              </Button>
              <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// --- Main Tab ---

export function AuthorizationRequestsTab() {
  const PAGE_SIZE = 10;
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const defaultBranchId = selectedBranchIds[0];
  const { hasPermission } = usePermission();
  const canSubmitPrivateRequest = hasPermission(PERMISSIONS.ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST);

  useEffect(() => {
    api
      .get('/account/authorization-requests')
      .then((res) => setRequests(res.data.data || []))
      .finally(() => setLoading(false));
  }, []);

  const totalPages = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));
  const pagedRequests = requests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Authorization Requests</h1>
      </div>

      {showModal && (
        <NewRequestModal
          defaultBranchId={defaultBranchId}
          onClose={() => setShowModal(false)}
          onCreated={(req) => {
            setRequests((prev) => [req, ...prev]);
            setPage(1);
          }}
        />
      )}

      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">My Requests</h2>
          {canSubmitPrivateRequest && (
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Request
          </Button>
          )}
        </div>

        {requests.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">No authorization requests yet.</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {pagedRequests.map((r) => (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">
                        {REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}
                      </p>
                      {r.reference && (
                        <p className="mt-0.5 text-xs text-gray-500">Ref: {r.reference}</p>
                      )}
                      {r.requested_amount != null && (
                        <p className="mt-1 text-sm font-semibold text-gray-800">
                          {fmtAmount(r.requested_amount)}
                        </p>
                      )}
                      {(r.bank_name || r.account_name || r.account_number) && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {[r.bank_name, r.account_name, r.account_number].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {r.status === 'rejected' && r.rejection_reason && (
                        <p className="mt-1 text-xs text-red-600">Reason: {r.rejection_reason}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">{fmtDate(r.created_at)}</p>
                    </div>
                    <Badge variant={statusVariant(r.status)}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </Badge>
                  </div>
                </CardBody>
              </Card>
            ))}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
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
      </div>
    </div>
  );
}
