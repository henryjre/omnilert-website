import { type ElementType, useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { AlertTriangle, Check, Clock3, ExternalLink, Users, X } from 'lucide-react';
import { useSocket } from '@/shared/hooks/useSocket';

type RequirementStatus = 'complete' | 'rejected' | 'verification' | 'pending';

interface EmployeeSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  summary: {
    total: number;
    complete: number;
    rejected: number;
    verification: number;
    pending: number;
  };
}

interface EmployeeRequirementDetail {
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
    valid_id_url: string | null;
  };
  requirements: Array<{
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
      reviewed_at: string | null;
    } | null;
  }>;
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

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function EmployeeRequirementsPage() {
  const EMPLOYEE_PAGE_SIZE = 4;
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [employeePage, setEmployeePage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmployeeRequirementDetail | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; title: string } | null>(null);
  const socket = useSocket('/employee-requirements');

  const selectedSummary = useMemo(
    () => employees.find((employee) => employee.id === selectedUserId) || null,
    [employees, selectedUserId],
  );

  const totalEmployeePages = Math.max(1, Math.ceil(employees.length / EMPLOYEE_PAGE_SIZE));
  const pagedEmployees = useMemo(
    () => employees.slice((employeePage - 1) * EMPLOYEE_PAGE_SIZE, employeePage * EMPLOYEE_PAGE_SIZE),
    [employees, employeePage],
  );

  const fetchEmployees = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError('');
    try {
      const res = await api.get('/employee-requirements');
      const rows: EmployeeSummary[] = res.data.data || [];
      setEmployees(rows);
      if (rows.length > 0) {
        const nextSelected = selectedUserId && rows.some((row) => row.id === selectedUserId)
          ? selectedUserId
          : rows[0].id;
        setSelectedUserId(nextSelected);
      } else {
        setSelectedUserId(null);
        setDetail(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load employee requirements');
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [selectedUserId]);

  const fetchDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const res = await api.get(`/employee-requirements/${userId}`);
      setDetail(res.data.data || null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load employee requirement details');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    if (selectedUserId) {
      fetchDetail(selectedUserId);
    }
  }, [selectedUserId, fetchDetail]);

  useEffect(() => {
    setEmployeePage((prev) => Math.min(prev, totalEmployeePages));
  }, [totalEmployeePages]);

  useEffect(() => {
    if (pagedEmployees.length === 0) return;
    if (!selectedUserId || !pagedEmployees.some((employee) => employee.id === selectedUserId)) {
      setSelectedUserId(pagedEmployees[0].id);
    }
  }, [pagedEmployees, selectedUserId]);

  useEffect(() => {
    if (!socket) return;

    const onUpdated = () => {
      fetchEmployees({ silent: true });
      if (selectedUserId) {
        fetchDetail(selectedUserId);
      }
    };

    socket.on('employee-requirement:updated', onUpdated);

    return () => {
      socket.off('employee-requirement:updated', onUpdated);
    };
  }, [socket, fetchEmployees, fetchDetail, selectedUserId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-6 w-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Employee Requirements</h1>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      {employees.length === 0 ? (
        <Card>
          <CardBody>
            <p className="py-8 text-center text-gray-500">
              No active Service Crew employees found.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Service Crew Employees</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              {pagedEmployees.map((employee) => {
                const isSelected = employee.id === selectedUserId;
                const completion = employee.summary.total > 0
                  ? Math.round((employee.summary.complete / employee.summary.total) * 100)
                  : 0;

                return (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => setSelectedUserId(employee.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      isSelected
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {employee.avatar_url ? (
                        <img
                          src={employee.avatar_url}
                          alt={`${employee.first_name} ${employee.last_name}`}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">
                          {getInitials(employee.first_name, employee.last_name)}
                        </div>
                      )}
                      <p className="font-medium text-gray-900">
                        {employee.first_name} {employee.last_name}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">{employee.email}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full bg-primary-600"
                        style={{ width: `${completion}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">
                        C {employee.summary.complete}
                      </span>
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                        V {employee.summary.verification}
                      </span>
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                        R {employee.summary.rejected}
                      </span>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                        I {employee.summary.pending}
                      </span>
                    </div>
                  </button>
                );
              })}

              {totalEmployeePages > 1 && (
                <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
                  <span>
                    Page {employeePage} of {totalEmployeePages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEmployeePage((prev) => Math.max(1, prev - 1))}
                      disabled={employeePage === 1}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setEmployeePage((prev) => Math.min(totalEmployeePages, prev + 1))}
                      disabled={employeePage === totalEmployeePages}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              {selectedSummary ? (
                <div className="flex items-center gap-2">
                  {selectedSummary.avatar_url ? (
                    <img
                      src={selectedSummary.avatar_url}
                      alt={`${selectedSummary.first_name} ${selectedSummary.last_name}`}
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600">
                      {getInitials(selectedSummary.first_name, selectedSummary.last_name)}
                    </div>
                  )}
                  <h2 className="font-semibold text-gray-900">
                    {selectedSummary.first_name} {selectedSummary.last_name}
                  </h2>
                </div>
              ) : (
                <h2 className="font-semibold text-gray-900">Requirement Details</h2>
              )}
            </CardHeader>
            <CardBody>
              {detailLoading ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : !detail ? (
                <p className="py-8 text-center text-sm text-gray-500">Select an employee to view details.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-2 text-sm text-gray-600">
                    <div className="rounded-lg bg-green-50 p-2">
                      <p className="text-xs text-green-600">Complete</p>
                      <p className="font-semibold text-green-700">{selectedSummary?.summary.complete ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-2">
                      <p className="text-xs text-blue-600">Verification</p>
                      <p className="font-semibold text-blue-700">{selectedSummary?.summary.verification ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-2">
                      <p className="text-xs text-red-600">Rejected</p>
                      <p className="font-semibold text-red-700">{selectedSummary?.summary.rejected ?? 0}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-2">
                      <p className="text-xs text-amber-600">Incomplete</p>
                      <p className="font-semibold text-amber-700">{selectedSummary?.summary.pending ?? 0}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {detail.requirements.map((requirement) => {
                      const status = STATUS_CONFIG[requirement.display_status];
                      return (
                        <div key={requirement.code} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900">{requirement.label}</p>
                            <span className={`inline-flex rounded-full p-1 ${status.iconClass}`}>
                              <status.Icon className="h-3.5 w-3.5" />
                            </span>
                          </div>
                          <div className="mt-3 space-y-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.containerClass}`}>
                              {status.label}
                            </span>
                            {requirement.document_url && (
                              getPreviewKind(requirement.document_url) === 'other' ? (
                                <a
                                  href={requirement.document_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
                                >
                                  View document <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPreviewDoc({
                                      url: requirement.document_url as string,
                                      title: requirement.label,
                                    })
                                  }
                                  className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
                                >
                                  View document
                                </button>
                              )
                            )}
                            {requirement.latest_submission?.rejection_reason && (
                              <p className="text-xs text-red-600">{requirement.latest_submission.rejection_reason}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
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
