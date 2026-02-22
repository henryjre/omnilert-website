import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';
import { BadgeCheck, Phone, Users, X } from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'inactive';

type EmployeeCard = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_number: string | null;
  pin: string | null;
  avatar_url: string | null;
  department_name: string | null;
  position_title: string | null;
  is_active: boolean;
  date_started_effective: string | null;
  days_of_employment: number | null;
};

type EmployeeDetail = {
  id: string;
  avatar_url: string | null;
  personal_information: {
    first_name: string;
    last_name: string;
    email: string;
    mobile_number: string | null;
    legal_name: string | null;
    birthday: string | null;
    gender: string | null;
    marital_status: string | null;
    address: string | null;
    sss_number: string | null;
    tin_number: string | null;
    pagibig_number: string | null;
    philhealth_number: string | null;
  };
  pin: string | null;
  emergency_contact_information: {
    emergency_contact: string | null;
    emergency_phone: string | null;
    emergency_relationship: string | null;
  };
  work_information: {
    department_id: string | null;
    department_name: string | null;
    position_title: string | null;
    status: 'active' | 'inactive';
    date_started: string | null;
    days_of_employment: number | null;
  };
  bank_information: {
    bank_id: number | null;
    account_number: string | null;
  };
  valid_id_url: string | null;
  roles: Array<{ id: string; name: string; color: string | null }>;
  department_options: Array<{ id: string; name: string }>;
};

type WorkFormState = {
  departmentId: string;
  positionTitle: string;
  isActive: boolean;
  dateStarted: string;
};

const BANK_LABEL: Record<number, string> = {
  2: 'Metrobank',
  3: 'Gcash',
  4: 'BDO',
  5: 'BPI',
  6: 'Maya',
};

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toLocalPhMobile(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).trim().replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('639') && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith('63') && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith('9') && digits.length === 10) return `0${digits}`;
  if (digits.startsWith('09') && digits.length === 11) return digits;
  return String(phone).trim();
}

function toDialHref(phone: string | null | undefined): string | null {
  const normalized = toLocalPhMobile(phone);
  if (!normalized) return null;
  return `tel:${normalized}`;
}

export function EmployeeProfilesPage() {
  const PAGE_SIZE = 12;
  const PANEL_ANIMATION_MS = 300;
  const { hasPermission } = usePermission();
  const canEditWorkProfile = hasPermission(PERMISSIONS.EMPLOYEE_EDIT_WORK_PROFILE);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingWork, setSavingWork] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<EmployeeCard[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const detailCacheRef = useRef<Record<string, EmployeeDetail>>({});
  const activeDetailRequestRef = useRef(0);
  const selectedUserIdRef = useRef<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [workEditMode, setWorkEditMode] = useState(false);
  const [workForm, setWorkForm] = useState<WorkFormState>({
    departmentId: '',
    positionTitle: '',
    isActive: true,
    dateStarted: '',
  });

  const buildDetailFromCard = useCallback((card: EmployeeCard): EmployeeDetail => ({
    id: card.id,
    avatar_url: card.avatar_url,
    personal_information: {
      first_name: card.first_name,
      last_name: card.last_name,
      email: card.email,
      mobile_number: card.mobile_number,
      legal_name: null,
      birthday: null,
      gender: null,
      marital_status: null,
      address: null,
      sss_number: null,
      tin_number: null,
      pagibig_number: null,
      philhealth_number: null,
    },
    pin: card.pin ?? null,
    emergency_contact_information: {
      emergency_contact: null,
      emergency_phone: null,
      emergency_relationship: null,
    },
    work_information: {
      department_id: null,
      department_name: card.department_name,
      position_title: card.position_title,
      status: card.is_active ? 'active' : 'inactive',
      date_started: card.date_started_effective,
      days_of_employment: card.days_of_employment,
    },
    bank_information: {
      bank_id: null,
      account_number: null,
    },
    valid_id_url: null,
    roles: [],
    department_options: [],
  }), []);

  const applyDetailToState = useCallback((payload: EmployeeDetail) => {
    setDetail(payload);
    setWorkForm({
      departmentId: payload.work_information.department_id ?? '',
      positionTitle: payload.work_information.position_title ?? '',
      isActive: payload.work_information.status === 'active',
      dateStarted: toDateInput(payload.work_information.date_started),
    });
  }, []);

  const fetchList = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError('');
    try {
      const res = await api.get('/employee-profiles', {
        params: {
          status,
          page,
          pageSize: PAGE_SIZE,
          search: search.trim() || undefined,
        },
      });
      const payload = res.data.data || {};
      setItems(payload.items || []);
      setPagination(payload.pagination || { total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 });
      const currentSelectedUserId = selectedUserIdRef.current;
      if ((payload.items || []).length === 0) {
        setPanelOpen(false);
        setSelectedUserId(null);
        setDetail(null);
      } else if (
        currentSelectedUserId &&
        !(payload.items || []).some((item: EmployeeCard) => item.id === currentSelectedUserId)
      ) {
        setPanelOpen(false);
        setSelectedUserId(null);
        setDetail(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load employee profiles');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [page, search, status]);

  const fetchDetail = useCallback(async (userId: string, options?: { silentError?: boolean }) => {
    const requestId = ++activeDetailRequestRef.current;
    const cached = detailCacheRef.current[userId];
    const card = items.find((item) => item.id === userId);
    if (cached) {
      applyDetailToState(cached);
    } else if (card) {
      applyDetailToState(buildDetailFromCard(card));
    }
    setDetailLoading(true);
    if (!options?.silentError) {
      setError('');
    }
    try {
      const res = await api.get(`/employee-profiles/${userId}`);
      const payload = res.data.data as EmployeeDetail;
      detailCacheRef.current[userId] = payload;
      if (selectedUserIdRef.current === userId) {
        applyDetailToState(payload);
      }
    } catch (err: any) {
      if (!options?.silentError) {
        setError(err.response?.data?.error || 'Failed to load employee profile details');
      }
    } finally {
      if (activeDetailRequestRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }, [applyDetailToState, buildDetailFromCard, items]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    fetchDetail(selectedUserId);
  }, [selectedUserId, fetchDetail]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 2500);
    return () => window.clearTimeout(timer);
  }, [success]);

  const selectedCard = useMemo(
    () => items.find((item) => item.id === selectedUserId) ?? null,
    [items, selectedUserId],
  );
  const selectedMobileDisplay = useMemo(
    () => toLocalPhMobile(detail?.personal_information.mobile_number) || 'Not set',
    [detail?.personal_information.mobile_number],
  );
  const selectedEmergencyDisplay = useMemo(
    () => toLocalPhMobile(detail?.emergency_contact_information.emergency_phone) || 'Not set',
    [detail?.emergency_contact_information.emergency_phone],
  );
  const employeeCallHref = useMemo(
    () => toDialHref(detail?.personal_information.mobile_number),
    [detail?.personal_information.mobile_number],
  );
  const emergencyCallHref = useMemo(
    () => toDialHref(detail?.emergency_contact_information.emergency_phone),
    [detail?.emergency_contact_information.emergency_phone],
  );

  const openPanel = (userId: string) => {
    const card = items.find((item) => item.id === userId);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

    // If panel is already open, just switch selected profile without toggling drawer animation.
    if (panelOpen) {
      const cached = detailCacheRef.current[userId];
      if (cached) {
        applyDetailToState(cached);
      } else if (card) {
        applyDetailToState(buildDetailFromCard(card));
      } else {
        setDetail(null);
      }
      selectedUserIdRef.current = userId;
      setSelectedUserId(userId);
      return;
    }

    // Ensure initial slide-in animates by rendering one frame in offscreen state first.
    const cached = detailCacheRef.current[userId];
    if (cached) {
      applyDetailToState(cached);
    } else if (card) {
      applyDetailToState(buildDetailFromCard(card));
    } else {
      setDetail(null);
    }
    setPanelOpen(false);
    selectedUserIdRef.current = userId;
    setSelectedUserId(userId);
    openTimerRef.current = window.setTimeout(() => {
      setPanelOpen(true);
      openTimerRef.current = null;
    }, 16);
  };

  const closePanel = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    setPanelOpen(false);
    setDetailLoading(false);
    setWorkEditMode(false);
    setSuccess('');
    closeTimerRef.current = window.setTimeout(() => {
      selectedUserIdRef.current = null;
      setSelectedUserId(null);
      setDetail(null);
      closeTimerRef.current = null;
    }, PANEL_ANIMATION_MS);
  };

  useEffect(() => () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
    }
  }, []);

  const saveWorkInformation = async () => {
    if (!detail) return;
    setSavingWork(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.patch(`/employee-profiles/${detail.id}/work-information`, {
        departmentId: workForm.departmentId || null,
        positionTitle: workForm.positionTitle.trim() || null,
        isActive: workForm.isActive,
        dateStarted: workForm.dateStarted || null,
      });
      const payload = res.data.data as EmployeeDetail;
      detailCacheRef.current[payload.id] = payload;
      applyDetailToState(payload);
      setItems((prev) => prev.map((item) => {
        if (item.id !== payload.id) return item;
        return {
          ...item,
          first_name: payload.personal_information.first_name,
          last_name: payload.personal_information.last_name,
          email: payload.personal_information.email,
          mobile_number: payload.personal_information.mobile_number,
          avatar_url: payload.avatar_url,
          department_name: payload.work_information.department_name,
          position_title: payload.work_information.position_title,
          is_active: payload.work_information.status === 'active',
          date_started_effective: payload.work_information.date_started,
          days_of_employment: payload.work_information.days_of_employment,
        };
      }));
      setSuccess('Work information updated.');
      setWorkEditMode(false);
      void fetchDetail(payload.id, { silentError: true });
      await fetchList({ silent: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update work information');
    } finally {
      setSavingWork(false);
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
    <>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Employee Profiles</h1>
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="inline-flex w-full rounded-lg bg-gray-100 p-1 md:w-auto">
            {(['all', 'active', 'inactive'] as StatusFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={`flex-1 rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors md:flex-none ${
                  status === item
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 hover:bg-gray-200'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex w-full gap-2 md:w-auto">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee"
              className="w-full md:w-64"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPage(1);
                fetchList();
              }}
            >
              Search
            </Button>
          </div>
        </div>

        {items.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center text-sm text-gray-500">
              No employee profiles found.
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openPanel(item.id)}
                  className={`rounded-xl border bg-white p-4 text-left transition hover:shadow-sm ${
                    selectedUserId === item.id ? 'border-primary-300' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {item.avatar_url ? (
                        <img
                          src={item.avatar_url}
                          alt={`${item.first_name} ${item.last_name}`}
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600">
                          {getInitials(item.first_name, item.last_name)}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-900">
                          {item.first_name} {item.last_name}
                        </p>
                        <p className="text-xs text-gray-500">{item.email}</p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-gray-600">
                    <span>Department</span>
                    <span className="font-medium text-gray-800">{item.department_name || 'Not set'}</span>
                    <span>Position</span>
                    <span className="font-medium text-gray-800">{item.position_title || 'Not set'}</span>
                    <span>Mobile</span>
                    <span className="font-medium text-gray-800">{toLocalPhMobile(item.mobile_number) || 'Not set'}</span>
                    <span>PIN</span>
                    <span className="font-medium text-gray-800">{item.pin || 'Not set'}</span>
                  </div>
                </button>
              ))}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedUserId && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={closePanel}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[560px] transform bg-white shadow-2xl transition-transform duration-300 ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {!selectedUserId ? null : (
          <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">Employee Profile</p>
                  <p className="font-semibold text-gray-900">
                    {selectedCard ? `${selectedCard.first_name} ${selectedCard.last_name}` : 'Details'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {!detail ? (
                  <div className="flex justify-center py-12">
                    <Spinner />
                  </div>
                ) : (
                  <div className="space-y-5 text-sm">
                    {success && (
                      <div className="rounded bg-green-50 px-3 py-2 text-xs text-green-700">
                        {success}
                      </div>
                    )}
                    {detailLoading && (
                      <div className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-700">
                        Updating profile details...
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <span className="text-gray-500">Name</span>
                      <span className="font-medium text-gray-900">
                        {detail.personal_information.first_name} {detail.personal_information.last_name}
                      </span>
                      <span className="text-gray-500">Email</span>
                      <span className="font-medium text-gray-900">{detail.personal_information.email}</span>
                      <span className="text-gray-500">Mobile</span>
                      <span className="font-medium text-gray-900">{selectedMobileDisplay}</span>
                      <span className="text-gray-500">PIN</span>
                      <span className="font-medium text-gray-900">{detail.pin || 'Not set'}</span>
                    </div>

                    {(employeeCallHref || emergencyCallHref) && (
                      <div className="flex flex-wrap justify-center gap-2">
                        {employeeCallHref && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              window.location.href = employeeCallHref;
                            }}
                          >
                            <Phone className="mr-1 h-4 w-4" />
                            Call Employee
                          </Button>
                        )}
                        {emergencyCallHref && (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              window.location.href = emergencyCallHref;
                            }}
                          >
                            <Phone className="mr-1 h-4 w-4" />
                            Call Emergency
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Personal Information</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <span className="text-gray-500">Legal Name</span>
                        <span>{detail.personal_information.legal_name || 'Not set'}</span>
                        <span className="text-gray-500">Birthday</span>
                        <span>{detail.personal_information.birthday || 'Not set'}</span>
                        <span className="text-gray-500">Gender</span>
                        <span>{detail.personal_information.gender || 'Not set'}</span>
                        <span className="text-gray-500">Address</span>
                        <span>{detail.personal_information.address || 'Not set'}</span>
                        <span className="text-gray-500">Marital Status</span>
                        <span>{detail.personal_information.marital_status || 'Not set'}</span>
                        <span className="text-gray-500">SSS Number</span>
                        <span>{detail.personal_information.sss_number || 'Not set'}</span>
                        <span className="text-gray-500">TIN Number</span>
                        <span>{detail.personal_information.tin_number || 'Not set'}</span>
                        <span className="text-gray-500">Pag-IBIG Number</span>
                        <span>{detail.personal_information.pagibig_number || 'Not set'}</span>
                        <span className="text-gray-500">PhilHealth Number</span>
                        <span>{detail.personal_information.philhealth_number || 'Not set'}</span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Emergency Contact Information</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <span className="text-gray-500">Contact Name</span>
                        <span>{detail.emergency_contact_information.emergency_contact || 'Not set'}</span>
                        <span className="text-gray-500">Contact Number</span>
                        <span>{selectedEmergencyDisplay}</span>
                        <span className="text-gray-500">Relationship</span>
                        <span>{detail.emergency_contact_information.emergency_relationship || 'Not set'}</span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Work Information</p>
                        {canEditWorkProfile && !workEditMode && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setWorkEditMode(true)}
                          >
                            Edit Work Information
                          </Button>
                        )}
                      </div>

                      {!workEditMode ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <span className="text-gray-500">Department</span>
                          <span>{detail.work_information.department_name || 'Not set'}</span>
                          <span className="text-gray-500">Position</span>
                          <span>{detail.work_information.position_title || 'Not set'}</span>
                          <span className="text-gray-500">Status</span>
                          <span className="capitalize">{detail.work_information.status}</span>
                          <span className="text-gray-500">Date Started</span>
                          <span>{detail.work_information.date_started || 'Not set'}</span>
                          <span className="text-gray-500">Days of Employment</span>
                          <span>{detail.work_information.days_of_employment ?? 'Not set'}</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
                            <select
                              value={workForm.departmentId}
                              onChange={(e) => setWorkForm((prev) => ({ ...prev, departmentId: e.target.value }))}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              <option value="">No department</option>
                              {detail.department_options.map((department) => (
                                <option key={department.id} value={department.id}>
                                  {department.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Input
                            label="Position"
                            value={workForm.positionTitle}
                            onChange={(e) => setWorkForm((prev) => ({ ...prev, positionTitle: e.target.value }))}
                            placeholder="e.g., Service Crew"
                          />
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Date Started</label>
                            <Input
                              type="date"
                              value={workForm.dateStarted}
                              onChange={(e) => setWorkForm((prev) => ({ ...prev, dateStarted: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                            <select
                              value={workForm.isActive ? 'active' : 'inactive'}
                              onChange={(e) => setWorkForm((prev) => ({ ...prev, isActive: e.target.value === 'active' }))}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="success" onClick={saveWorkInformation} disabled={savingWork}>
                              {savingWork ? 'Saving...' : 'Save'}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setWorkEditMode(false);
                                setWorkForm({
                                  departmentId: detail.work_information.department_id ?? '',
                                  positionTitle: detail.work_information.position_title ?? '',
                                  isActive: detail.work_information.status === 'active',
                                  dateStarted: toDateInput(detail.work_information.date_started),
                                });
                              }}
                              disabled={savingWork}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Bank Information</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <span className="text-gray-500">Bank</span>
                        <span>
                          {detail.bank_information.bank_id
                            ? (BANK_LABEL[detail.bank_information.bank_id] ?? `Bank ID ${detail.bank_information.bank_id}`)
                            : 'Not set'}
                        </span>
                        <span className="text-gray-500">Account Number</span>
                        <span>{detail.bank_information.account_number || 'Not set'}</span>
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Roles</p>
                      <div className="flex flex-wrap gap-2">
                        {detail.roles.map((role) => (
                          <span
                            key={role.id}
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${role.color ?? '#64748B'}22`,
                              color: role.color ?? '#334155',
                            }}
                          >
                            <BadgeCheck className="h-3 w-3" />
                            {role.name}
                          </span>
                        ))}
                        {detail.roles.length === 0 && <span className="text-xs text-gray-500">No roles assigned</span>}
                      </div>
                    </div>

                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Valid ID</p>
                      {detail.valid_id_url ? (
                        <a
                          href={detail.valid_id_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-primary-600 hover:underline"
                        >
                          View valid ID document
                        </a>
                      ) : (
                        <span className="text-sm text-gray-500">No valid ID uploaded</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
          </div>
        )}
      </div>
    </>
  );
}
