import { type ElementType, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { AlertTriangle, Check, Clock3, ExternalLink, Upload, X } from 'lucide-react';

type RequirementStatus = 'complete' | 'rejected' | 'verification' | 'pending';

interface RequirementItem {
  code: string;
  label: string;
  sort_order: number;
  display_status: RequirementStatus;
  document_url: string | null;
  latest_submission: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    rejection_reason: string | null;
  } | null;
}

const STATUS_CONFIG: Record<
  RequirementStatus,
  { label: string; containerClass: string; iconClass: string; Icon: ElementType }
> = {
  complete: {
    label: 'Complete',
    containerClass: 'bg-green-50 text-green-700',
    iconClass: 'bg-green-100 text-green-600',
    Icon: Check,
  },
  rejected: {
    label: 'Rejected',
    containerClass: 'bg-red-50 text-red-700',
    iconClass: 'bg-red-100 text-red-600',
    Icon: X,
  },
  verification: {
    label: 'Verification',
    containerClass: 'bg-blue-50 text-blue-700',
    iconClass: 'bg-blue-100 text-blue-600',
    Icon: Clock3,
  },
  pending: {
    label: 'Incomplete',
    containerClass: 'bg-amber-50 text-amber-700',
    iconClass: 'bg-amber-100 text-amber-600',
    Icon: AlertTriangle,
  },
};

function getUrlPath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase().split('?')[0] ?? '';
  }
}

function getPreviewKind(url: string): 'image' | 'pdf' | 'other' {
  const path = getUrlPath(url);
  if (/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/.test(path)) return 'image';
  if (/\.pdf$/.test(path)) return 'pdf';
  return 'other';
}

export function EmploymentTab() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [selectedRequirement, setSelectedRequirement] = useState<RequirementItem | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; title: string } | null>(null);

  const fetchRequirements = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/account/employment/requirements');
      setRequirements(res.data.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load employment requirements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequirements();
  }, []);

  const closeModal = () => {
    setSelectedRequirement(null);
    setSelectedFile(null);
  };

  const submitRequirement = async () => {
    if (!selectedRequirement) return;
    setError('');
    setSuccess('');

    const canUseExistingGovId =
      selectedRequirement.code === 'government_issued_id' && !!selectedRequirement.document_url;

    if (!selectedFile && !canUseExistingGovId) {
      setError('Select a file before submitting this requirement.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('document', selectedFile);
      }

      await api.post(
        `/account/employment/requirements/${selectedRequirement.code}/submit`,
        formData,
      );
      setSuccess(`${selectedRequirement.label} submitted for verification.`);
      closeModal();
      await fetchRequirements();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit requirement');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Employment Requirements</h2>
          <p className="mt-1 text-sm text-gray-500">
            Upload your documents per requirement. Each submission is reviewed before completion.
          </p>
        </CardHeader>
        <CardBody>
          {error && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          {success && <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {requirements.map((requirement) => {
              const status = STATUS_CONFIG[requirement.display_status];
              return (
                <button
                  key={requirement.code}
                  type="button"
                  onClick={() => {
                    setSelectedRequirement(requirement);
                    setSelectedFile(null);
                  }}
                  className="min-h-[180px] rounded-xl border border-gray-200 p-3 text-left transition hover:border-primary-300 hover:shadow-sm"
                >
                  <div className="flex h-full flex-col justify-between">
                    <div className="space-y-2">
                      <div className={`inline-flex rounded-full p-1.5 ${status.iconClass}`}>
                        <status.Icon className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-[13px] font-medium leading-snug text-gray-900">{requirement.label}</p>
                    </div>

                    <div className="space-y-1.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${status.containerClass}`}>
                        {status.label}
                      </span>
                      {requirement.latest_submission?.rejection_reason && (
                        <p className="line-clamp-2 text-xs text-red-600">
                          {requirement.latest_submission.rejection_reason}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {selectedRequirement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <h3 className="font-semibold text-gray-900">{selectedRequirement.label}</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="text-sm text-gray-600">
                Status: <span className="font-medium capitalize">{STATUS_CONFIG[selectedRequirement.display_status].label}</span>
              </div>

              {selectedRequirement.document_url && (
                getPreviewKind(selectedRequirement.document_url) === 'other' ? (
                  <a
                    href={selectedRequirement.document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                  >
                    View current document <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewDoc({
                        url: selectedRequirement.document_url as string,
                        title: selectedRequirement.label,
                      })
                    }
                    className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                  >
                    View current document
                  </button>
                )
              )}

              {selectedRequirement.display_status === 'verification' ? (
                <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                  This requirement is already pending verification.
                </div>
              ) : (
                <>
                  <label className="block text-sm font-medium text-gray-700">Upload image or PDF</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                  />
                  <p className="text-xs text-gray-500">
                    Accepted formats: all image types and PDF (max 10MB).
                  </p>
                </>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={closeModal} disabled={submitting}>
                  Close
                </Button>
                {selectedRequirement.display_status !== 'verification' && (
                  <Button variant="success" onClick={submitRequirement} disabled={submitting}>
                    <Upload className="mr-1 h-4 w-4" />
                    {submitting ? 'Submitting...' : 'Submit for Verification'}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {previewDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="relative w-full max-w-4xl rounded-lg bg-white shadow-xl">
            <button
              type="button"
              onClick={() => setPreviewDoc(null)}
              className="absolute right-3 top-3 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="border-b border-gray-200 px-4 py-3 pr-12">
              <p className="text-sm font-semibold text-gray-900">{previewDoc.title}</p>
            </div>
            <div className="max-h-[80vh] overflow-auto p-4">
              {getPreviewKind(previewDoc.url) === 'image' && (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.title}
                  className="max-h-[72vh] w-full rounded border border-gray-200 object-contain"
                />
              )}
              {getPreviewKind(previewDoc.url) === 'pdf' && (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.title}
                  className="h-[72vh] w-full rounded border border-gray-200"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
