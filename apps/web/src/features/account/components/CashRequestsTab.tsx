import { useEffect, useRef, useState } from 'react';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useBranchStore } from '@/shared/store/branchStore';
import { DollarSign, X, Plus, Paperclip } from 'lucide-react';
import { ImageModal } from '@/features/pos-verification/components/ImageModal';

// --- Constants ---

const REQUEST_TYPES = [
  { key: 'salary_wage_request', label: 'Salary/Wage Request' },
  { key: 'cash_advance_request', label: 'Cash Advance Request' },
  { key: 'expense_reimbursement', label: 'Expense Reimbursement' },
  { key: 'training_allowance', label: 'Training Allowance' },
  { key: 'transport_allowance', label: 'Transport Allowance' },
] as const;

type RequestTypeKey = (typeof REQUEST_TYPES)[number]['key'];

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

interface NewRequestModalProps {
  onClose: () => void;
  onCreated: (request: any) => void;
}

function NewRequestModal({ onClose, onCreated }: NewRequestModalProps) {
  const [step, setStep] = useState<'choose' | 'form'>('choose');
  const [selectedType, setSelectedType] = useState<RequestTypeKey | null>(null);
  const [form, setForm] = useState({ reference: '', amount: '', bankName: '', accountName: '', accountNumber: '' });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);

  function handleChoose(typeKey: RequestTypeKey) {
    setSelectedType(typeKey);
    setStep('form');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType) return;
    setError('');
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('branchId', selectedBranchIds[0] ?? '');
      formData.append('requestType', selectedType);
      formData.append('reference', form.reference);
      formData.append('amount', form.amount);
      formData.append('bankName', form.bankName);
      formData.append('accountName', form.accountName);
      formData.append('accountNumber', form.accountNumber);
      if (attachment) formData.append('attachment', attachment);

      const res = await api.post('/account/cash-requests', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onCreated(res.data.data);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTypeLabel = REQUEST_TYPES.find((t) => t.key === selectedType)?.label ?? '';
  const isReimbursement = selectedType === 'expense_reimbursement';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === 'choose' ? 'New Cash Request' : selectedTypeLabel}
          </h2>
          <button onClick={onClose} className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step 1 — choose type */}
        {step === 'choose' && (
          <div className="space-y-2 p-6">
            {REQUEST_TYPES.map((type) => (
              <button
                key={type.key}
                onClick={() => handleChoose(type.key)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
              >
                {type.label}
                <Plus className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — fill form */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Reference</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                placeholder="e.g. February 1st Cut Off - 0001"
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Requested Amount (PHP)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Bank Name</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                placeholder="e.g. BDO"
                value={form.bankName}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Account Name</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                value={form.accountName}
                onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Account Number</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                required
              />
            </div>

            {/* Attachment — required for expense reimbursement */}
            {isReimbursement && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
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
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600"
                >
                  <Paperclip className="h-4 w-4" />
                  {attachment ? attachment.name : 'Click to upload receipt'}
                </button>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep('choose')}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Request'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// --- Main Tab ---

export function CashRequestsTab() {
  const PAGE_SIZE = 10;
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api
      .get('/account/cash-requests')
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
        <DollarSign className="h-6 w-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Cash Requests</h1>
      </div>

      {showModal && (
        <NewRequestModal
          onClose={() => setShowModal(false)}
          onCreated={(r) => {
            setRequests((prev) => [r, ...prev]);
            setPage(1);
          }}
        />
      )}

      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">My Requests</h2>
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Request
          </Button>
        </div>

        {requests.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">No cash requests yet</p>
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
                        {REQUEST_TYPES.find((t) => t.key === r.request_type)?.label ?? r.request_type ?? 'Cash Request'}
                      </p>
                      {r.reference && (
                        <p className="mt-0.5 text-xs text-gray-500">Ref: {r.reference}</p>
                      )}
                      <p className="mt-1 text-sm font-semibold text-gray-800">{fmtAmount(r.amount)}</p>
                      {r.bank_name && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {r.bank_name} · {r.account_name} · {r.account_number}
                        </p>
                      )}
                      {r.attachment_url && (
                        <button
                          onClick={() => {
                            const url = r.attachment_url.startsWith('http') 
                              ? r.attachment_url 
                              : `${import.meta.env.VITE_API_URL}${r.attachment_url}`;
                            setAttachmentUrl(url);
                            setImageModalOpen(true);
                          }}
                          className="mt-1 flex items-center gap-1 text-xs text-primary-600 hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          View Attachment
                        </button>
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

      {/* Image modal for attachment preview */}
      <ImageModal
        images={attachmentUrl ? [{ file_path: attachmentUrl }] : []}
        initialIndex={0}
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
      />
    </div>
  );
}
