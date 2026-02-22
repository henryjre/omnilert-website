import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';
import { BadgeCheck, ChevronDown, ChevronUp, Filter, Phone, Users, X } from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'resigned' | 'inactive' | 'suspended';
type EmploymentStatus = 'active' | 'resigned' | 'inactive' | 'suspended';
type SortBy = 'date_started' | 'days_of_employment' | '';
type SortDirection = 'asc' | 'desc';

type EmployeeCard = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile_number: string | null;
  pin: string | null;
  avatar_url: string | null;
  companies: Array<{
    company_id: string;
    company_name: string;
    company_theme_color: string | null;
  }>;
  resident_branch: {
    company_id: string;
    company_name: string;
    branch_id: string;
    branch_name: string;
  } | null;
  borrow_branches: Array<{
    company_id: string;
    company_name: string;
    branch_id: string;
    branch_name: string;
  }>;
  department_name: string | null;
  position_title: string | null;
  employment_status: EmploymentStatus;
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
    company: { id: string; name: string } | null;
    companies: Array<{
      company_id: string;
      company_name: string;
      company_theme_color: string | null;
    }>;
    resident_branch: {
      company_id: string;
      company_name: string;
      branch_id: string;
      branch_name: string;
    } | null;
    home_resident_branch: {
      company_id: string;
      company_name: string;
      branch_id: string;
      branch_name: string;
    } | null;
    borrow_branches: Array<{
      company_id: string;
      company_name: string;
      branch_id: string;
      branch_name: string;
    }>;
    branch_options: Array<{
      company_id: string;
      company_name: string;
      branch_id: string;
      branch_name: string;
    }>;
    department_id: string | null;
    department_name: string | null;
    position_title: string | null;
    status: EmploymentStatus;
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
  employmentStatus: EmploymentStatus;
  residentCompanyId: string;
  residentBranchId: string;
  dateStarted: string;
};

type EmployeeProfileFilterState = {
  departmentId: string;
  roleIds: string[];
  sortBy: SortBy;
  sortDirection: SortDirection;
};

type FilterOptionsPayload = {
  departments: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string }>;
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

function normalizeEmploymentStatus(status: unknown, isActive: boolean): EmploymentStatus {
  if (status === 'active' || status === 'resigned' || status === 'inactive' || status === 'suspended') return status;
  return isActive ? 'active' : 'inactive';
}

function getStatusBadge(status: EmploymentStatus): { label: string; className: string } {
  if (status === 'active') return { label: 'Active', className: 'bg-green-100 text-green-700' };
  if (status === 'resigned') return { label: 'Resigned', className: 'bg-amber-100 text-amber-700' };
  if (status === 'suspended') return { label: 'Suspended', className: 'bg-red-100 text-red-700' };
  return { label: 'Inactive', className: 'bg-gray-200 text-gray-700' };
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

function OverflowMorePill({
  remaining,
  children,
}: {
  remaining: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
      >
        +{remaining} more
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-max max-w-[280px] rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <div className="flex max-w-[260px] flex-wrap gap-1.5">
            {children}
          </div>
          <div className="absolute -bottom-1 right-4 h-2 w-2 rotate-45 border-b border-r border-gray-200 bg-white" />
        </div>
      )}
    </div>
  );
}

function pillsWithOverflow(
  items: Array<{ key: string; label: string }>,
  maxVisible = 3,
  color: 'indigo' | 'emerald' | 'slate' = 'indigo',
) {
  const visible = items.slice(0, maxVisible);
  const remaining = Math.max(0, items.length - maxVisible);
  const colorClass = color === 'emerald'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : color === 'slate'
      ? 'bg-slate-100 text-slate-700 border-slate-200'
      : 'bg-indigo-50 text-indigo-700 border-indigo-200';

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((item) => (
        <span
          key={item.key}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${colorClass}`}
          title={item.label}
        >
          {item.label}
        </span>
      ))}
      {remaining > 0 && (
        <OverflowMorePill remaining={remaining}>
          {items.slice(maxVisible).map((item) => (
            <span
              key={`more-${item.key}`}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${colorClass}`}
              title={item.label}
            >
              {item.label}
            </span>
          ))}
        </OverflowMorePill>
      )}
    </div>
  );
}

function companyPillsWithOverflow(
  items: Array<{ key: string; label: string; themeColor: string | null }>,
  maxVisible = 3,
) {
  const visible = items.slice(0, maxVisible);
  const remaining = Math.max(0, items.length - maxVisible);
  const isHex = (value: string | null | undefined) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const renderCompanyPill = (item: { key: string; label: string; themeColor: string | null }) => {
    if (isHex(item.themeColor)) {
      return (
        <span
          key={item.key}
          className="rounded-full border px-2 py-0.5 text-[11px] font-medium"
          title={item.label}
          style={{
            color: item.themeColor as string,
            backgroundColor: `${item.themeColor}22`,
            borderColor: `${item.themeColor}55`,
          }}
        >
          {item.label}
        </span>
      );
    }

    return (
      <span
        key={item.key}
        className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
        title={item.label}
      >
        {item.label}
      </span>
    );
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((item) => renderCompanyPill(item))}
      {remaining > 0 && (
        <OverflowMorePill remaining={remaining}>
          {items.slice(maxVisible).map((item) => renderCompanyPill({ ...item, key: `more-${item.key}` }))}
        </OverflowMorePill>
      )}
    </div>
  );
}

export function EmployeeProfilesPage() {
  const DESKTOP_PAGE_SIZE = 12;
  const MOBILE_PAGE_SIZE = 6;
  const INITIAL_FILTERS: EmployeeProfileFilterState = {
    departmentId: '',
    roleIds: [],
    sortBy: '',
    sortDirection: 'desc',
  };
  const PANEL_ANIMATION_MS = 300;
  const { hasPermission } = usePermission();
  const canEditWorkProfile = hasPermission(PERMISSIONS.EMPLOYEE_EDIT_WORK_PROFILE);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingWork, setSavingWork] = useState(false);
  const [error, setError] = useState('');
  const [workUpdateSuccess, setWorkUpdateSuccess] = useState('');
  const [workUpdateError, setWorkUpdateError] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<EmployeeProfileFilterState>(INITIAL_FILTERS);
  const [draftFilters, setDraftFilters] = useState<EmployeeProfileFilterState>(INITIAL_FILTERS);
  const [filterOptions, setFilterOptions] = useState<FilterOptionsPayload>({ departments: [], roles: [] });
  const [page, setPage] = useState(1);
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const pageSize = isMobile ? MOBILE_PAGE_SIZE : DESKTOP_PAGE_SIZE;
  const [items, setItems] = useState<EmployeeCard[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: pageSize, totalPages: 1 });
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
    employmentStatus: 'active',
    residentCompanyId: '',
    residentBranchId: '',
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
      company: null,
      companies: card.companies,
      resident_branch: card.resident_branch,
      home_resident_branch: null,
      borrow_branches: card.borrow_branches,
      branch_options: [],
      department_id: null,
      department_name: card.department_name,
      position_title: card.position_title,
      status: normalizeEmploymentStatus(card.employment_status, card.is_active),
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
      employmentStatus: normalizeEmploymentStatus(payload.work_information.status, false),
      residentCompanyId: payload.work_information.resident_branch?.company_id
        ?? payload.work_information.branch_options[0]?.company_id
        ?? '',
      residentBranchId: payload.work_information.resident_branch?.branch_id
        ?? payload.work_information.branch_options[0]?.branch_id
        ?? '',
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
          pageSize,
          search: search.trim() || undefined,
          departmentId: appliedFilters.departmentId || undefined,
          roleIdsCsv: appliedFilters.roleIds.length > 0 ? appliedFilters.roleIds.join(',') : undefined,
          sortBy: appliedFilters.sortBy || undefined,
          sortDirection: appliedFilters.sortBy ? appliedFilters.sortDirection : undefined,
        },
      });
      const payload = res.data.data || {};
      setItems(
        (payload.items || []).map((item: EmployeeCard) => ({
          ...item,
          employment_status: normalizeEmploymentStatus(item.employment_status, item.is_active),
        })),
      );
      setPagination(payload.pagination || { total: 0, page: 1, pageSize: pageSize, totalPages: 1 });
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
  }, [appliedFilters, page, pageSize, search, status]);

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
    api
      .get('/employee-profiles/filter-options')
      .then((res) => {
        setFilterOptions(res.data.data || { departments: [], roles: [] });
      })
      .catch(() => {
        setFilterOptions({ departments: [], roles: [] });
      });
  }, []);

  useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    fetchDetail(selectedUserId);
  }, [selectedUserId, fetchDetail]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [status]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [appliedFilters.departmentId, appliedFilters.roleIds, appliedFilters.sortBy, appliedFilters.sortDirection]);

  useEffect(() => {
    if (!workUpdateSuccess) return;
    const timer = window.setTimeout(() => setWorkUpdateSuccess(''), 2500);
    return () => window.clearTimeout(timer);
  }, [workUpdateSuccess]);

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

  const hasActiveFilters = useMemo(
    () =>
      search.trim().length > 0
      || Boolean(appliedFilters.departmentId)
      || appliedFilters.roleIds.length > 0
      || Boolean(appliedFilters.sortBy),
    [appliedFilters.departmentId, appliedFilters.roleIds.length, appliedFilters.sortBy, search],
  );

  const openFilters = () => {
    if (filtersOpen) {
      setFiltersOpen(false);
      return;
    }
    setDraftSearch(search);
    setDraftFilters({
      departmentId: appliedFilters.departmentId,
      roleIds: [...appliedFilters.roleIds],
      sortBy: appliedFilters.sortBy,
      sortDirection: appliedFilters.sortDirection,
    });
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setSearch(draftSearch.trim());
    setAppliedFilters({
      departmentId: draftFilters.departmentId,
      roleIds: [...draftFilters.roleIds],
      sortBy: draftFilters.sortBy,
      sortDirection: draftFilters.sortDirection,
    });
    setPage(1);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setSearch('');
    setDraftSearch('');
    setDraftFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setPage(1);
    setFiltersOpen(false);
  };

  const toggleRoleFilter = (roleId: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      roleIds: prev.roleIds.includes(roleId)
        ? prev.roleIds.filter((id) => id !== roleId)
        : [...prev.roleIds, roleId],
    }));
  };

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
    setWorkUpdateSuccess('');
    setWorkUpdateError('');
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
    setWorkUpdateSuccess('');
    setWorkUpdateError('');
    try {
      const res = await api.patch(`/employee-profiles/${detail.id}/work-information`, {
        departmentId: workForm.departmentId || null,
        positionTitle: workForm.positionTitle.trim() || null,
        employmentStatus: workForm.employmentStatus,
        isActive: workForm.employmentStatus === 'active',
        residentBranch: workForm.residentCompanyId && workForm.residentBranchId
          ? {
            companyId: workForm.residentCompanyId,
            branchId: workForm.residentBranchId,
          }
          : null,
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
          companies: payload.work_information.companies,
          resident_branch: payload.work_information.resident_branch,
          borrow_branches: payload.work_information.borrow_branches,
          department_name: payload.work_information.department_name,
          position_title: payload.work_information.position_title,
          employment_status: normalizeEmploymentStatus(payload.work_information.status, false),
          is_active: payload.work_information.status === 'active',
          date_started_effective: payload.work_information.date_started,
          days_of_employment: payload.work_information.days_of_employment,
        };
      }));
      setWorkUpdateSuccess('Work information updated.');
      setWorkEditMode(false);
      void fetchDetail(payload.id, { silentError: true });
      await fetchList({ silent: true });
    } catch (err: any) {
      setWorkUpdateError(err.response?.data?.error || 'Failed to update work information');
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

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="mx-auto flex w-full items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit sm:justify-start">
            {(['all', 'active', 'resigned', 'inactive', 'suspended'] as StatusFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium capitalize transition-colors sm:flex-none ${
                  status === item
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={openFilters}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto ${
              hasActiveFilters || search.trim().length > 0
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {(hasActiveFilters || search.trim().length > 0) && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] text-white">
                  !
                </span>
              )}
            </div>
            <span className="ml-auto">
              {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </button>
        </div>

        {filtersOpen && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Search Employee</label>
                <Input
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                  placeholder="Search employee"
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
                <select
                  value={draftFilters.departmentId}
                  onChange={(e) => setDraftFilters((prev) => ({ ...prev, departmentId: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">All departments</option>
                  {filterOptions.departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Sort By</label>
                <select
                  value={draftFilters.sortBy}
                  onChange={(e) =>
                    setDraftFilters((prev) => ({ ...prev, sortBy: e.target.value as SortBy }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Default</option>
                  <option value="date_started">Date Started</option>
                  <option value="days_of_employment">Days of Employment</option>
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">Roles</label>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 p-2">
                  <div className="flex flex-wrap gap-2">
                    {filterOptions.roles.map((role) => {
                      const selected = draftFilters.roleIds.includes(role.id);
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => toggleRoleFilter(role.id)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                            selected
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {role.name}
                        </button>
                      );
                    })}
                    {filterOptions.roles.length === 0 && (
                      <span className="text-xs text-gray-500">No roles available</span>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Sort Direction</label>
                <select
                  value={draftFilters.sortDirection}
                  onChange={(e) =>
                    setDraftFilters((prev) => ({ ...prev, sortDirection: e.target.value as SortDirection }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  disabled={!draftFilters.sortBy}
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={clearFilters}>
                Clear
              </Button>
              <Button type="button" className="w-full sm:w-auto" onClick={applyFilters}>
                Apply
              </Button>
              <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => setFiltersOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {hasActiveFilters && (
          <div className="text-xs text-gray-500">
            Filters applied
          </div>
        )}

        {items.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center text-sm text-gray-500">
              No employee profiles found.
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const badge = getStatusBadge(item.employment_status);
                return (
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
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
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
                  <div className="mt-3 space-y-2 text-xs text-gray-600">
                    <div>
                      <span className="mb-1 block">Companies</span>
                      {item.companies.length > 0
                        ? companyPillsWithOverflow(
                          item.companies.map((company) => ({
                            key: company.company_id,
                            label: company.company_name,
                            themeColor: company.company_theme_color,
                          })),
                          3,
                        )
                        : <span className="text-gray-500">Not set</span>}
                    </div>
                    <div>
                      <span className="mb-1 block">Resident Branch</span>
                      {item.resident_branch ? (
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          {item.resident_branch.branch_name}
                        </span>
                      ) : (
                        <span className="text-gray-500">N/A</span>
                      )}
                    </div>
                    <div>
                      <span className="mb-1 block">Borrow Branches</span>
                      {item.borrow_branches.length > 0
                        ? pillsWithOverflow(
                          item.borrow_branches.map((branch) => ({
                            key: `${branch.company_id}:${branch.branch_id}`,
                            label: branch.branch_name,
                          })),
                          3,
                          'slate',
                        )
                        : <span className="text-gray-500">None</span>}
                    </div>
                  </div>
                </button>
                );
              })}
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
                      {workUpdateSuccess && (
                        <div className="mb-2 rounded bg-green-50 px-3 py-2 text-xs text-green-700">
                          {workUpdateSuccess}
                        </div>
                      )}
                      {workUpdateError && (
                        <div className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
                          {workUpdateError}
                        </div>
                      )}

                      {!workEditMode ? (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                          <div className="col-span-2">
                            <span className="mb-1 block text-gray-500">Company</span>
                            {detail.work_information.companies.length > 0
                              ? companyPillsWithOverflow(
                                detail.work_information.companies.map((company) => ({
                                  key: company.company_id,
                                  label: company.company_name,
                                  themeColor: company.company_theme_color,
                                })),
                                3,
                              )
                              : 'Not set'}
                          </div>
                          <div className="col-span-2">
                            <span className="mb-1 block text-gray-500">Resident Branch</span>
                            {detail.work_information.resident_branch ? (
                              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                {detail.work_information.resident_branch.branch_name}
                              </span>
                            ) : (
                              <span>N/A</span>
                            )}
                          </div>
                          {!detail.work_information.resident_branch && detail.work_information.home_resident_branch && (
                            <>
                              <span className="text-gray-500">Home Resident Branch</span>
                              <span>
                                {detail.work_information.home_resident_branch.branch_name}
                                {' '}
                                ({detail.work_information.home_resident_branch.company_name})
                              </span>
                            </>
                          )}
                          <div className="col-span-2">
                            <span className="mb-1 block text-gray-500">Borrow Branches</span>
                            {detail.work_information.borrow_branches.length > 0
                              ? pillsWithOverflow(
                                detail.work_information.borrow_branches.map((branch) => ({
                                  key: `${branch.company_id}:${branch.branch_id}`,
                                  label: branch.branch_name,
                                })),
                                3,
                                'slate',
                              )
                              : 'None'}
                          </div>
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
                              value={workForm.employmentStatus}
                              onChange={(e) =>
                                setWorkForm((prev) => ({
                                  ...prev,
                                  employmentStatus: e.target.value as EmploymentStatus,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              <option value="active">Active</option>
                              <option value="resigned">Resigned</option>
                              <option value="inactive">Inactive</option>
                              <option value="suspended">Suspended</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Resident Company</label>
                            <select
                              value={workForm.residentCompanyId}
                              onChange={(e) => {
                                const companyId = e.target.value;
                                const firstBranch = detail.work_information.branch_options.find(
                                  (branch) => branch.company_id === companyId,
                                );
                                setWorkForm((prev) => ({
                                  ...prev,
                                  residentCompanyId: companyId,
                                  residentBranchId: firstBranch?.branch_id ?? '',
                                }));
                              }}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              {Array.from(
                                new Map(
                                  detail.work_information.branch_options.map((branch) => [
                                    branch.company_id,
                                    branch.company_name,
                                  ]),
                                ).entries(),
                              ).map(([companyId, companyName]) => (
                                <option key={companyId} value={companyId}>
                                  {companyName}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Resident Branch</label>
                            <select
                              value={workForm.residentBranchId}
                              onChange={(e) => setWorkForm((prev) => ({ ...prev, residentBranchId: e.target.value }))}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            >
                              {detail.work_information.branch_options
                                .filter((branch) => branch.company_id === workForm.residentCompanyId)
                                .map((branch) => (
                                  <option key={branch.branch_id} value={branch.branch_id}>
                                    {branch.branch_name}
                                  </option>
                                ))}
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
                                  employmentStatus: normalizeEmploymentStatus(detail.work_information.status, false),
                                  residentCompanyId: detail.work_information.resident_branch?.company_id
                                    ?? detail.work_information.branch_options[0]?.company_id
                                    ?? '',
                                  residentBranchId: detail.work_information.resident_branch?.branch_id
                                    ?? detail.work_information.branch_options[0]?.branch_id
                                    ?? '',
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
