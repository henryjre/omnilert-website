import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useBranchStore } from '@/shared/store/branchStore';
import { PERMISSIONS } from '@omnilert/shared';
import { AlertTriangle, BadgeCheck, Building2, Check, ChevronDown, ChevronUp, Clock3, ExternalLink, Filter, GitBranch, Hash, LogOut, MapPin, Phone, ShieldOff, UserCheck, UserMinus, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type RequirementStatus = 'complete' | 'rejected' | 'verification' | 'pending';

interface EmployeeRequirementSummary {
  total: number;
  complete: number;
  rejected: number;
  verification: number;
  pending: number;
}

interface EmployeeRequirementItem {
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
}

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
  requirement_summary?: EmployeeRequirementSummary;
};

type EmployeeRequirementSummaryRow = {
  id: string;
  summary: EmployeeRequirementSummary;
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
  requirements: EmployeeRequirementItem[];
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

type AssignmentOptionCompany = {
  id: string;
  name: string;
  branches: Array<{ id: string; name: string; odoo_branch_id: string }>;
};

type CompanyAssignmentForm = {
  companyId: string;
  branchIds: string[];
};

const BANK_LABEL: Record<number, string> = {
  2: 'Metrobank',
  3: 'Gcash',
  4: 'BDO',
  5: 'BPI',
  6: 'Maya',
};

const REQUIREMENT_STATUS_CONFIG: Record<
  RequirementStatus,
  { label: string; containerClass: string; iconClass: string; Icon: React.ElementType }
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

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
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

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isEmployeeRequirementSummary(value: unknown): value is EmployeeRequirementSummary {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    isNumber(v.total)
    && isNumber(v.complete)
    && isNumber(v.rejected)
    && isNumber(v.verification)
    && isNumber(v.pending)
  );
}

function isEmployeeRequirementSummaryRow(value: unknown): value is EmployeeRequirementSummaryRow {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && isEmployeeRequirementSummary(v.summary);
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
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
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

// --- Employee Card ---

const EmployeeCard = memo(({
  item,
  selected,
  onClick,
  canApproveRequirements,
}: {
  item: EmployeeCard;
  selected: boolean;
  onClick: (id: string) => void;
  canApproveRequirements: boolean;
}) => {
  const badge = getStatusBadge(item.employment_status);
  const deptPosition = [item.department_name, item.position_title].filter(Boolean).join(' · ');

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(item.id);
        }
      }}
      onClick={() => onClick(item.id)}
      className={`flex flex-col rounded-xl border bg-white p-4 text-left transition hover:shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
        selected
          ? 'border-primary-300 ring-1 ring-primary-300 bg-primary-50/50'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Identity row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {item.avatar_url ? (
            <img
              src={item.avatar_url}
              alt={`${item.first_name} ${item.last_name}`}
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
              {getInitials(item.first_name, item.last_name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">
              {item.first_name} {item.last_name}
            </p>
            {deptPosition ? (
              <p className="mt-0.5 truncate text-xs text-gray-500">{deptPosition}</p>
            ) : (
              <p className="mt-0.5 text-xs text-gray-400 italic">No department · No position</p>
            )}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Metadata block */}
      <div className="mt-3 border-t border-gray-100 pt-3 space-y-2 pb-3">
        {/* PIN */}
        <div className="flex items-center gap-2">
          <span title="PIN"><Hash className="h-4 w-4 shrink-0 text-gray-400" /></span>
          <span className="font-mono text-sm text-gray-800">{item.pin || <span className="text-gray-400 font-sans text-xs">Not set</span>}</span>
        </div>

        {/* Companies */}
        <div className="flex items-start gap-2">
          <span title="Companies"><Building2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" /></span>
          <div className="min-w-0">
            {item.companies.length > 0
              ? companyPillsWithOverflow(
                item.companies.map((company) => ({
                  key: company.company_id,
                  label: company.company_name,
                  themeColor: company.company_theme_color,
                })),
                2,
              )
              : <span className="text-xs text-gray-400">Not assigned</span>}
          </div>
        </div>

        {/* Resident branch */}
        <div className="flex items-center gap-2">
          <span title="Resident Branch"><MapPin className="h-4 w-4 shrink-0 text-emerald-500" /></span>
          <div className="min-w-0">
            {item.resident_branch ? (
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                {item.resident_branch.branch_name}
              </span>
            ) : (
              <span className="text-xs text-gray-400">No resident branch</span>
            )}
          </div>
        </div>

        {/* Borrow branches */}
        <div className="flex items-start gap-2">
          <span title="Borrow Branches"><GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /></span>
          <div className="min-w-0">
            {item.borrow_branches.length > 0
              ? pillsWithOverflow(
                item.borrow_branches.map((branch) => ({
                  key: `${branch.company_id}:${branch.branch_id}`,
                  label: branch.branch_name,
                })),
                2,
                'slate',
              )
              : <span className="text-xs text-gray-400">None</span>}
          </div>
        </div>
      </div>

      {/* Requirements — pinned to bottom */}
      {canApproveRequirements && item.requirement_summary && (
        <div className="mt-auto border-t border-gray-100 pt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-500">
            <span>Requirements</span>
            <span>
              {item.requirement_summary.complete}/{item.requirement_summary.total}
              {' '}
              ({item.requirement_summary.total > 0
                ? Math.round((item.requirement_summary.complete / item.requirement_summary.total) * 100)
                : 0}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{
                width: `${item.requirement_summary.total > 0
                  ? Math.round((item.requirement_summary.complete / item.requirement_summary.total) * 100)
                  : 0}%`,
              }}
            />
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <div title="Complete" className="flex items-center justify-center min-w-8 gap-1 rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
              C <span className="text-green-600">{item.requirement_summary.complete}</span>
            </div>
            <div title="Verification" className="flex items-center justify-center min-w-8 gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
              V <span className="text-blue-600">{item.requirement_summary.verification}</span>
            </div>
            <div title="Rejected" className="flex items-center justify-center min-w-8 gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
              R <span className="text-red-600">{item.requirement_summary.rejected}</span>
            </div>
            <div title="Incomplete" className="flex items-center justify-center min-w-8 gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
              I <span className="text-amber-600">{item.requirement_summary.pending}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export function EmployeeProfilesPage() {
  const DESKTOP_PAGE_SIZE = 12;
  const MOBILE_PAGE_SIZE = 6;
  const INITIAL_FILTERS: EmployeeProfileFilterState = {
    departmentId: '',
    roleIds: [],
    sortBy: '',
    sortDirection: 'desc',
  };
  const { hasPermission } = usePermission();
  const authUser = useAuthStore((s) => s.user);
  const { selectedBranchIds, branches } = useBranchStore();

  const branchLabel = useMemo(() => {
    if (branches.length === 0) return '';
    const selectedBranches = branches.filter((b) => selectedBranchIds.includes(b.id));
    if (selectedBranches.length === 0 || selectedBranches.length === branches.length) return 'All Branches';
    if (selectedBranches.length === 1) return selectedBranches[0].name;
    return `${selectedBranches[0].name} +${selectedBranches.length - 1} more`;
  }, [branches, selectedBranchIds]);

  const selectedBranchIdSet = useMemo(() => new Set(selectedBranchIds), [selectedBranchIds]);
  const canApproveRequirements = hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS);
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const canEditWorkProfile = hasPermission(PERMISSIONS.EMPLOYEE_PROFILES_MANAGE_WORK);
  const requirementSummaryMergeRetryDoneRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingWork, setSavingWork] = useState(false);
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
  const [previewDoc, setPreviewDoc] = useState<{ url: string; title: string } | null>(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pageSize: pageSize, totalPages: 1 });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const detailCacheRef = useRef<Record<string, EmployeeDetail>>({});
  const activeDetailRequestRef = useRef(0);
  const selectedUserIdRef = useRef<string | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [workEditMode, setWorkEditMode] = useState(false);
  const workEditModeRef = useRef(false);
  const [assignmentOptions, setAssignmentOptions] = useState<AssignmentOptionCompany[]>([]);
  const [assignmentOptionsLoading, setAssignmentOptionsLoading] = useState(false);
  const [editCompanyAssignments, setEditCompanyAssignments] = useState<CompanyAssignmentForm[]>([]);
  const [showOdooConfirm, setShowOdooConfirm] = useState(false);
  const [workForm, setWorkForm] = useState<WorkFormState>({
    departmentId: '',
    positionTitle: '',
    employmentStatus: 'active',
    residentCompanyId: '',
    residentBranchId: '',
    dateStarted: '',
  });

  const appliedRoleIdsKey = useMemo(
    () => [...appliedFilters.roleIds].sort().join(","),
    [appliedFilters.roleIds],
  );

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
    requirements: [],
  }), []);

  const applyDetailToState = useCallback((payload: EmployeeDetail) => {
    setDetail(payload);
    // Don't reset the form while the user is actively editing it.
    if (workEditModeRef.current) return;
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
    try {
      const [res, reqRes] = await Promise.all([
        api.get('/employee-profiles', {
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
        }),
        api.get('/employee-requirements').catch(() => ({ data: { data: [] } })),
      ]);
      const reqSummaries = reqRes.data?.data || [];
      const summaryMap = new Map<string, EmployeeRequirementSummary>(
        reqSummaries.map((s: any) => [s.id, s.summary])
      );
      const payload = res.data.data || {};
      setItems(
        (payload.items || []).map((item: EmployeeCard) => ({
          ...item,
          employment_status: normalizeEmploymentStatus(item.employment_status, item.is_active),
          requirement_summary: summaryMap.get(item.id),
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
      if (!options?.silent) {
        showErrorToast(err.response?.data?.error || 'Failed to load employee profiles');
      }
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [appliedFilters, page, pageSize, search, showErrorToast, status]);

  const fetchRequirementSummariesAndMerge = useCallback(async () => {
    try {
      const reqRes = await api.get("/employee-requirements");
      const rowsRaw = (reqRes.data as Record<string, unknown> | undefined)?.data;
      const rowsArray: Array<unknown> = Array.isArray(rowsRaw) ? rowsRaw : [];
      const summaryRows = rowsArray.filter(isEmployeeRequirementSummaryRow);

      const summaryMap = new Map<string, EmployeeRequirementSummary>();
      for (const row of summaryRows) {
        summaryMap.set(row.id, row.summary);
      }

      setItems((prev) =>
        prev.map((item) => {
          const summary = summaryMap.get(item.id);
          if (!summary) return item;
          return { ...item, requirement_summary: summary };
        }),
      );
    } catch {
      // Requirement summaries are optional for the main list; don't block page usage.
    }
  }, []);

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
    try {
      const [res, reqRes] = await Promise.all([
        api.get(`/employee-profiles/${userId}`),
        api.get(`/employee-requirements/${userId}`).catch(() => ({ data: { data: null } }))
      ]);
      const payload = res.data.data as EmployeeDetail;
      payload.requirements = reqRes.data?.data?.requirements || [];
      detailCacheRef.current[userId] = payload;
      if (selectedUserIdRef.current === userId) {
        applyDetailToState(payload);
      }
    } catch (err: any) {
      if (!options?.silentError) {
        showErrorToast(err.response?.data?.error || 'Failed to load employee profile details');
      }
    } finally {
      if (activeDetailRequestRef.current === requestId) {
        setDetailLoading(false);
      }
    }
  }, [applyDetailToState, buildDetailFromCard, items, showErrorToast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // On a full reload, auth state may rehydrate after the first fetchList() completes.
  // When that happens, /employee-requirements may return an empty result, leaving
  // `item.requirement_summary` undefined (progress bar won't render).
  useEffect(() => {
    if (!canApproveRequirements) return;
    if (!authUser) return;
    if (items.length === 0) return;

    const anyMissing = items.some((i) => i.requirement_summary === undefined);
    if (!anyMissing) return;
    if (requirementSummaryMergeRetryDoneRef.current) return;

    requirementSummaryMergeRetryDoneRef.current = true;
    void fetchRequirementSummariesAndMerge();
  }, [authUser, canApproveRequirements, fetchRequirementSummariesAndMerge, items]);

  useEffect(() => {
    requirementSummaryMergeRetryDoneRef.current = false;
  }, [status, page, pageSize, search, appliedFilters.departmentId, appliedRoleIdsKey, appliedFilters.sortBy, appliedFilters.sortDirection]);

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

  const reqSocket = useSocket('/employee-requirements');

  useEffect(() => {
    if (!reqSocket) return;

    const onRequirementUpdated = () => {
      void fetchList({ silent: true });
      if (selectedUserIdRef.current) {
        void fetchDetail(selectedUserIdRef.current, { silentError: true });
      }
    };

    reqSocket.on('employee-requirement:updated', onRequirementUpdated);

    return () => {
      reqSocket.off('employee-requirement:updated', onRequirementUpdated);
    };
  }, [reqSocket, fetchList, fetchDetail]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [appliedFilters.departmentId, appliedFilters.roleIds, appliedFilters.sortBy, appliedFilters.sortDirection]);

  useEffect(() => {
    setPage(1);
    setPanelOpen(false);
    setSelectedUserId(null);
    setDetail(null);
  }, [selectedBranchIds]);

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



  const filteredItems = useMemo(
    () => selectedBranchIdSet.size === 0
      ? items
      : items.filter((item) => {
          if (item.resident_branch && selectedBranchIdSet.has(item.resident_branch.branch_id)) return true;
          return item.borrow_branches.some((b) => selectedBranchIdSet.has(b.branch_id));
        }),
    [items, selectedBranchIdSet],
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
    setSelectedUserId(null);
    setDetail(null);
    setDetailLoading(false);
    workEditModeRef.current = false;
    setWorkEditMode(false);
    selectedUserIdRef.current = null;
  };

  useEffect(() => () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
    }
  }, []);

  const saveWorkInformation = async () => {
    if (!detail) return;
    if (editCompanyAssignments.length === 0) {
      showErrorToast('Select at least one company assignment.');
      return;
    }
    const missingBranches = editCompanyAssignments.find((item) => item.branchIds.length === 0);
    if (missingBranches) {
      const companyName = assignmentOptions.find((company) => company.id === missingBranches.companyId)?.name ?? 'selected company';
      showErrorToast(`Select at least one branch for ${companyName}.`);
      return;
    }
    const residentCompany = editCompanyAssignments.find((item) => item.companyId === workForm.residentCompanyId);
    if (!workForm.residentCompanyId || !workForm.residentBranchId || !residentCompany?.branchIds.includes(workForm.residentBranchId)) {
      showErrorToast('Select a resident branch from the assigned branches.');
      return;
    }
    setSavingWork(true);
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
        companyAssignments: editCompanyAssignments.length > 0 ? editCompanyAssignments : undefined,
        dateStarted: workForm.dateStarted || null,
      });
      const payload = res.data.data as EmployeeDetail;
      detailCacheRef.current[payload.id] = payload;
      applyDetailToState(payload);
      const assignmentsMap = new Map<string, string[]>();
      for (const branch of payload.work_information.branch_options) {
        const current = assignmentsMap.get(branch.company_id) ?? [];
        current.push(branch.branch_id);
        assignmentsMap.set(branch.company_id, Array.from(new Set(current)));
      }
      setEditCompanyAssignments(
        Array.from(assignmentsMap.entries()).map(([companyId, branchIds]) => ({ companyId, branchIds })),
      );
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
      showSuccessToast('Work information updated.');
      workEditModeRef.current = false; setWorkEditMode(false);
      setShowOdooConfirm(false);
      void fetchDetail(payload.id, { silentError: true });
      await fetchList({ silent: true });
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to update work information');
    } finally {
      setSavingWork(false);
    }
  };

  const cancelWorkEdit = useCallback(() => {
    if (!detail) return;
    const assignmentMap = new Map<string, string[]>();
    for (const branch of detail.work_information.branch_options) {
      const current = assignmentMap.get(branch.company_id) ?? [];
      current.push(branch.branch_id);
      assignmentMap.set(branch.company_id, Array.from(new Set(current)));
    }
    setEditCompanyAssignments(
      Array.from(assignmentMap.entries()).map(([companyId, branchIds]) => ({ companyId, branchIds })),
    );
    workEditModeRef.current = false; setWorkEditMode(false);
    setShowOdooConfirm(false);
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
  }, [detail]);

  const companyMap = useMemo(
    () => new Map(assignmentOptions.map((company) => [company.id, company])),
    [assignmentOptions],
  );

  const residentCompanyOptions = useMemo(
    () => editCompanyAssignments
      .map((assignment) => {
        const company = companyMap.get(assignment.companyId);
        return company ? { id: company.id, name: company.name } : null;
      })
      .filter((company): company is { id: string; name: string } => Boolean(company)),
    [companyMap, editCompanyAssignments],
  );

  const residentBranchOptions = useMemo(() => {
    if (!workForm.residentCompanyId) return [];
    const selectedCompany = editCompanyAssignments.find((item) => item.companyId === workForm.residentCompanyId);
    if (!selectedCompany) return [];
    const branchMap = new Map(
      (companyMap.get(workForm.residentCompanyId)?.branches ?? []).map((branch) => [branch.id, branch.name]),
    );
    return selectedCompany.branchIds
      .map((branchId) => {
        const name = branchMap.get(branchId);
        return name ? { id: branchId, name } : null;
      })
      .filter((branch): branch is { id: string; name: string } => Boolean(branch));
  }, [companyMap, editCompanyAssignments, workForm.residentCompanyId]);

  const setResidentFromAssignments = useCallback((nextAssignments: CompanyAssignmentForm[]) => {
    const residentCompany = nextAssignments.find((item) => item.companyId === workForm.residentCompanyId);
    if (residentCompany && residentCompany.branchIds.includes(workForm.residentBranchId)) {
      return;
    }
    if (residentCompany && residentCompany.branchIds.length > 0) {
      setWorkForm((prev) => ({ ...prev, residentBranchId: residentCompany.branchIds[0] }));
      return;
    }
    const firstCompany = nextAssignments.find((item) => item.branchIds.length > 0);
    setWorkForm((prev) => ({
      ...prev,
      residentCompanyId: firstCompany?.companyId ?? '',
      residentBranchId: firstCompany?.branchIds[0] ?? '',
    }));
  }, [workForm.residentBranchId, workForm.residentCompanyId]);

  const toggleCompany = useCallback((companyId: string) => {
    setEditCompanyAssignments((current) => {
      const exists = current.find((item) => item.companyId === companyId);
      const next = exists
        ? current.filter((item) => item.companyId !== companyId)
        : [...current, { companyId, branchIds: [] }];
      setResidentFromAssignments(next);
      return next;
    });
  }, [setResidentFromAssignments]);

  const toggleBranch = useCallback((companyId: string, branchId: string) => {
    setEditCompanyAssignments((current) => {
      const next = current.map((item) => {
        if (item.companyId !== companyId) return item;
        return {
          ...item,
          branchIds: item.branchIds.includes(branchId)
            ? item.branchIds.filter((id) => id !== branchId)
            : [...item.branchIds, branchId],
        };
      });
      setResidentFromAssignments(next);
      return next;
    });
  }, [setResidentFromAssignments]);

  const enterWorkEditMode = useCallback(async () => {
    if (!detail || assignmentOptionsLoading) return;
    setAssignmentOptionsLoading(true);
    try {
      if (assignmentOptions.length === 0) {
        const optionsRes = await api.get('/employee-profiles/assignment-options');
        setAssignmentOptions(optionsRes.data.data?.companies || []);
      }
      const assignmentMap = new Map<string, string[]>();
      for (const branch of detail.work_information.branch_options) {
        const current = assignmentMap.get(branch.company_id) ?? [];
        current.push(branch.branch_id);
        assignmentMap.set(branch.company_id, Array.from(new Set(current)));
      }
      const initialAssignments = Array.from(assignmentMap.entries()).map(([companyId, branchIds]) => ({ companyId, branchIds }));
      setEditCompanyAssignments(initialAssignments);
      const initialResidentCompanyId = detail.work_information.resident_branch?.company_id
        ?? initialAssignments[0]?.companyId
        ?? '';
      const selectedCompany = initialAssignments.find((item) => item.companyId === initialResidentCompanyId);
      setWorkForm((prev) => ({
        ...prev,
        residentCompanyId: initialResidentCompanyId,
        residentBranchId: detail.work_information.resident_branch?.branch_id
          ?? selectedCompany?.branchIds[0]
          ?? '',
      }));
      workEditModeRef.current = true; setWorkEditMode(true);
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to load assignment options');
    } finally {
      setAssignmentOptionsLoading(false);
    }
  }, [assignmentOptions.length, assignmentOptionsLoading, detail, showErrorToast]);

  const handleSaveWorkInformation = () => {
    if (!detail) return;
    const currentBranchIds = new Set(
      detail.work_information.branch_options.map((branch) => branch.branch_id),
    );
    const hasNewBranches = editCompanyAssignments.some((assignment) =>
      assignment.branchIds.some((branchId) => !currentBranchIds.has(branchId)),
    );
    if (hasNewBranches) {
      setShowOdooConfirm(true);
      return;
    }
    void saveWorkInformation();
  };

  const STATUS_TABS: Array<{ id: StatusFilter; label: string; icon: LucideIcon }> = [
    { id: 'all', label: 'All', icon: Users },
    { id: 'active', label: 'Active', icon: UserCheck },
    { id: 'resigned', label: 'Resigned', icon: LogOut },
    { id: 'inactive', label: 'Inactive', icon: UserMinus },
    { id: 'suspended', label: 'Suspended', icon: ShieldOff },
  ];

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-primary-600" />
              <h1 className="text-2xl font-bold text-gray-900">Employee Profiles</h1>
              {branchLabel && (
                <span className="mt-1 hidden text-sm font-medium text-primary-600 sm:inline">
                  {branchLabel}
                </span>
              )}
            </div>
            {branchLabel && (
              <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
                {branchLabel}
              </p>
            )}

            <p className="mt-1 hidden text-sm text-gray-500 sm:block">
              Manage employee profiles, work information, and requirements.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ViewToggle
            options={STATUS_TABS}
            activeId={status}
            onChange={(id) => setStatus(id)}
            layoutId="employee-profile-tabs"
            className="sm:flex-1"
            labelAboveOnMobile
          />
          <button
            type="button"
            onClick={openFilters}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto ${
              hasActiveFilters
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {hasActiveFilters && (
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

        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              key="filter-panel"
              initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
              animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
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
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">Default</option>
                      <option value="date_started">Date Started</option>
                      <option value="days_of_employment">Days of Employment</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Roles</label>
                    <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white p-2">
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
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
            </motion.div>
          )}
        </AnimatePresence>

        {hasActiveFilters && (
          <div className="text-xs text-gray-500">
            Filters applied
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gray-200" />
                    <div className="space-y-1.5">
                      <div className="h-4 w-28 rounded bg-gray-200" />
                      <div className="h-3 w-20 rounded bg-gray-100" />
                    </div>
                  </div>
                  <div className="h-5 w-16 rounded-full bg-gray-100" />
                </div>
                <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                  <div className="h-3 w-24 rounded bg-gray-100" />
                  <div className="flex gap-1.5">
                    <div className="h-5 w-16 rounded-full bg-gray-100" />
                    <div className="h-5 w-16 rounded-full bg-gray-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Users className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">No employee profiles found for the selected filters.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => (
                <EmployeeCard
                  key={item.id}
                  item={item}
                  selected={selectedUserId === item.id}
                  onClick={openPanel}
                  canApproveRequirements={canApproveRequirements}
                />
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

      {showOdooConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">Confirm Branch Assignment</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">
                This employee will be assigned to new branch(es). An Odoo employee account will be
                created for any branch where one does not already exist, using the same PIN code.
                Do you want to continue?
              </p>
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                type="button"
                className="flex-1"
                variant="standard"
                disabled={savingWork}
                onClick={() => {
                  setShowOdooConfirm(false);
                  void saveWorkInformation();
                }}
              >
                Yes, Save Changes
              </Button>
              <Button
                type="button"
                className="flex-1"
                variant="secondary"
                disabled={savingWork}
                onClick={() => setShowOdooConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {createPortal(
        <AnimatePresence>
          {selectedUserId && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={closePanel}
              />

              {/* Detail panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-white shadow-2xl"
              >
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

              <div className="flex-1 overflow-y-auto">
                {!detail ? (
                  <div className="flex justify-center py-12">
                    <Spinner />
                  </div>
                ) : (
                  <>
                    {/* Dossier header block */}
                    <div className="flex items-start gap-4 border-b border-gray-200 px-6 py-5">
                      {detail.avatar_url ? (
                        <img
                          src={detail.avatar_url}
                          alt={`${detail.personal_information.first_name} ${detail.personal_information.last_name}`}
                          className="h-[72px] w-[72px] shrink-0 rounded-full object-cover ring-2 ring-gray-100"
                        />
                      ) : (
                        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-primary-100 text-xl font-bold text-primary-700 ring-2 ring-gray-100">
                          {getInitials(detail.personal_information.first_name, detail.personal_information.last_name)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xl font-bold text-gray-900 leading-tight">
                          {detail.personal_information.first_name} {detail.personal_information.last_name}
                        </p>
                        {detail.personal_information.legal_name &&
                          detail.personal_information.legal_name !== `${detail.personal_information.first_name} ${detail.personal_information.last_name}` && (
                          <p className="mt-0.5 text-xs italic text-gray-400">
                            Legal: {detail.personal_information.legal_name}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {(() => {
                            const badge = getStatusBadge(detail.work_information.status);
                            return (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                                {badge.label}
                              </span>
                            );
                          })()}
                          {employeeCallHref && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => { window.location.href = employeeCallHref; }}
                            >
                              <Phone className="mr-1 h-3.5 w-3.5" />
                              Call
                            </Button>
                          )}
                          {emergencyCallHref && (
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={() => { window.location.href = emergencyCallHref; }}
                            >
                              <Phone className="mr-1 h-3.5 w-3.5" />
                              Emergency
                            </Button>
                          )}
                        </div>
                        {(detail.work_information.department_name || detail.work_information.position_title) && (
                          <p className="mt-1.5 text-sm text-gray-500">
                            {[detail.work_information.department_name, detail.work_information.position_title].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-400">
                          <span>PIN: <span className="font-mono text-gray-700">{detail.pin || '—'}</span></span>
                          <span>Email: <span className="text-gray-700">{detail.personal_information.email}</span></span>
                          {detail.personal_information.mobile_number && (
                            <span>Mobile: <span className="text-gray-700">{selectedMobileDisplay}</span></span>
                          )}
                        </div>
                        {detailLoading && (
                          <p className="mt-2 text-[11px] text-blue-500">Updating profile details...</p>
                        )}
                      </div>
                    </div>

                    {/* Dossier sections */}
                    <div className="space-y-3 p-6 text-sm">

                      {/* Personal Information */}
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="flex items-center border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Personal Information</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Birthday</p>
                            <p className="mt-0.5 font-medium text-gray-800">{formatDate(detail.personal_information.birthday)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Gender</p>
                            <p className="mt-0.5 font-medium text-gray-800 capitalize">{detail.personal_information.gender || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Marital Status</p>
                            <p className="mt-0.5 font-medium text-gray-800 capitalize">{detail.personal_information.marital_status || '—'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Address</p>
                            <p className="mt-0.5 font-medium text-gray-800">{detail.personal_information.address || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">SSS Number</p>
                            <p className="mt-0.5 font-mono text-sm text-gray-800">{detail.personal_information.sss_number || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">TIN Number</p>
                            <p className="mt-0.5 font-mono text-sm text-gray-800">{detail.personal_information.tin_number || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Pag-IBIG</p>
                            <p className="mt-0.5 font-mono text-sm text-gray-800">{detail.personal_information.pagibig_number || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">PhilHealth</p>
                            <p className="mt-0.5 font-mono text-sm text-gray-800">{detail.personal_information.philhealth_number || '—'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Work Information */}
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Work Information</span>
                          {canEditWorkProfile && !workEditMode && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={detailLoading}
                              onClick={() => { void enterWorkEditMode(); }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                        <div className="px-4 py-3">
                      {!workEditMode ? (
                        <div className="space-y-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Companies</p>
                            <div className="mt-1">
                              {detail.work_information.companies.length > 0
                                ? companyPillsWithOverflow(
                                  detail.work_information.companies.map((company) => ({
                                    key: company.company_id,
                                    label: company.company_name,
                                    themeColor: company.company_theme_color,
                                  })),
                                  4,
                                )
                                : <span className="text-gray-400">—</span>}
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Resident Branch</p>
                            <div className="mt-1">
                              {detail.work_information.resident_branch ? (
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                  {detail.work_information.resident_branch.branch_name}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                              {!detail.work_information.resident_branch && detail.work_information.home_resident_branch && (
                                <span className="ml-2 text-xs text-gray-500">
                                  (Home: {detail.work_information.home_resident_branch.branch_name})
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Borrow Branches</p>
                            <div className="mt-1">
                              {detail.work_information.borrow_branches.length > 0
                                ? pillsWithOverflow(
                                  detail.work_information.borrow_branches.map((branch) => ({
                                    key: `${branch.company_id}:${branch.branch_id}`,
                                    label: branch.branch_name,
                                  })),
                                  4,
                                  'slate',
                                )
                                : <span className="text-gray-400">None</span>}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-100 pt-3">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Department</p>
                              <p className="mt-0.5 font-medium text-gray-800">{detail.work_information.department_name || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Position</p>
                              <p className="mt-0.5 font-medium text-gray-800">{detail.work_information.position_title || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Date Started</p>
                              <p className="mt-0.5 font-medium text-gray-800">{formatDate(detail.work_information.date_started)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Days Employed</p>
                              <p className="mt-0.5 font-medium text-gray-800">{detail.work_information.days_of_employment ?? '—'}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <AnimatePresence initial={false}>
                          <motion.div
                            key="work-edit-form"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                            className="space-y-4"
                          >
                            {/* Row 1: Department + Position */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Department</label>
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
                              <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Position</label>
                                <input
                                  type="text"
                                  value={workForm.positionTitle}
                                  onChange={(e) => setWorkForm((prev) => ({ ...prev, positionTitle: e.target.value }))}
                                  placeholder="e.g., Service Crew"
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                              </div>
                            </div>

                            {/* Row 2: Date Started + Status */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Date Started</label>
                                <input
                                  type="date"
                                  value={workForm.dateStarted}
                                  onChange={(e) => setWorkForm((prev) => ({ ...prev, dateStarted: e.target.value }))}
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Employment Status</label>
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
                            </div>

                            {/* Row 3: Resident Company + Resident Branch */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Resident Company</label>
                                <select
                                  value={workForm.residentCompanyId}
                                  onChange={(e) => {
                                    const companyId = e.target.value;
                                    const selectedCompany = editCompanyAssignments.find((item) => item.companyId === companyId);
                                    setWorkForm((prev) => ({
                                      ...prev,
                                      residentCompanyId: companyId,
                                      residentBranchId: selectedCompany?.branchIds[0] ?? '',
                                    }));
                                  }}
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                >
                                  {residentCompanyOptions.map((company) => (
                                    <option key={company.id} value={company.id}>
                                      {company.name}
                                    </option>
                                  ))}
                                  {residentCompanyOptions.length === 0 && (
                                    <option value="">No assigned companies</option>
                                  )}
                                </select>
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Resident Branch</label>
                                <select
                                  value={workForm.residentBranchId}
                                  onChange={(e) => setWorkForm((prev) => ({ ...prev, residentBranchId: e.target.value }))}
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                                >
                                  {residentBranchOptions.map((branch) => (
                                    <option key={branch.id} value={branch.id}>
                                      {branch.name}
                                    </option>
                                  ))}
                                  {residentBranchOptions.length === 0 && (
                                    <option value="">No assigned branches</option>
                                  )}
                                </select>
                              </div>
                            </div>

                            {/* Company / Branch assignments */}
                            <div>
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                                Company Access & Branch Targets
                              </p>
                              {assignmentOptionsLoading ? (
                                <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-blue-600">
                                  <Spinner size="sm" />
                                  Loading assignment options...
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {assignmentOptions.map((company) => {
                                    const selected = editCompanyAssignments.find((item) => item.companyId === company.id);
                                    const isSelected = Boolean(selected);
                                    return (
                                      <div
                                        key={company.id}
                                        className={`overflow-hidden rounded-lg border transition-colors ${
                                          isSelected ? 'border-primary-200 bg-primary-50/40' : 'border-gray-200 bg-white'
                                        }`}
                                      >
                                        {/* Company toggle row */}
                                        <button
                                          type="button"
                                          onClick={() => toggleCompany(company.id)}
                                          className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                                        >
                                          <span className={`text-sm font-medium transition-colors ${isSelected ? 'text-primary-700' : 'text-gray-700'}`}>
                                            {company.name}
                                          </span>
                                          <span className={`flex h-5 w-5 items-center justify-center rounded border text-xs transition-colors ${
                                            isSelected
                                              ? 'border-primary-500 bg-primary-600 text-white'
                                              : 'border-gray-300 bg-white text-transparent'
                                          }`}>
                                            <Check className="h-3 w-3" />
                                          </span>
                                        </button>

                                        {/* Branch list — animated slide-down */}
                                        <AnimatePresence initial={false}>
                                          {isSelected && (
                                            <motion.div
                                              key={`branches-${company.id}`}
                                              initial={{ height: 0, opacity: 0 }}
                                              animate={{ height: 'auto', opacity: 1 }}
                                              exit={{ height: 0, opacity: 0 }}
                                              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                              className="overflow-hidden"
                                            >
                                              <div className="border-t border-primary-100 px-3 py-2.5">
                                                <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-400">Branches</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                  {company.branches.map((branch) => {
                                                    const branchSelected = selected?.branchIds.includes(branch.id) ?? false;
                                                    return (
                                                      <button
                                                        key={branch.id}
                                                        type="button"
                                                        onClick={() => toggleBranch(company.id, branch.id)}
                                                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                                                          branchSelected
                                                            ? 'border-emerald-300 bg-emerald-600 text-white shadow-sm'
                                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                                        }`}
                                                      >
                                                        {branch.name}
                                                      </button>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Save / Cancel */}
                            <div className="flex gap-2 border-t border-gray-100 pt-3">
                              <Button variant="success" onClick={handleSaveWorkInformation} disabled={savingWork} className="flex-1">
                                {savingWork ? 'Saving...' : 'Save Changes'}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={cancelWorkEdit}
                                disabled={savingWork}
                              >
                                Cancel
                              </Button>
                            </div>
                          </motion.div>
                        </AnimatePresence>
                      )}
                        </div>
                      </div>

                      {/* Emergency Contact */}
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="flex items-center border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Emergency Contact</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Contact Name</p>
                            <p className="mt-0.5 font-medium text-gray-800">{detail.emergency_contact_information.emergency_contact || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Relationship</p>
                            <p className="mt-0.5 font-medium text-gray-800">{detail.emergency_contact_information.emergency_relationship || '—'}</p>
                          </div>
                          <div className="col-span-2 flex items-center justify-between">
                            <div>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400">Phone</p>
                              <p className="mt-0.5 font-medium text-gray-800">{selectedEmergencyDisplay}</p>
                            </div>
                            {emergencyCallHref && (
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => { window.location.href = emergencyCallHref; }}
                              >
                                <Phone className="mr-1 h-3.5 w-3.5" />
                                Call
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Bank & Documents */}
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="flex items-center border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Bank & Documents</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Bank</p>
                            <p className="mt-0.5 font-medium text-gray-800">
                              {detail.bank_information.bank_id
                                ? (BANK_LABEL[detail.bank_information.bank_id] ?? `Bank ID ${detail.bank_information.bank_id}`)
                                : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Account Number</p>
                            <p className="mt-0.5 font-mono text-sm text-gray-800">{detail.bank_information.account_number || '—'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Valid ID</p>
                            <div className="mt-1">
                              {detail.valid_id_url ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc({ url: detail.valid_id_url!, title: 'Valid ID' })}
                                  className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:underline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  View valid ID document
                                </button>
                              ) : (
                                <span className="text-gray-400">No valid ID uploaded</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Roles */}
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="flex items-center border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Roles</span>
                        </div>
                        <div className="px-4 py-3">
                          {detail.roles.length > 0 ? (
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
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">No roles assigned</span>
                          )}
                        </div>
                      </div>

                      {/* Requirements */}
                      {hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS) && (
                        <div className="overflow-hidden rounded-lg border border-gray-200">
                          <div className="flex items-center border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Requirements</span>
                          </div>
                          <div className="px-4 py-3">
                            {!detail.requirements?.length ? (
                              <span className="text-sm text-gray-400">No requirements found</span>
                            ) : (
                              <div className="space-y-2">
                                {detail.requirements.map((req) => {
                                  const statusConf = REQUIREMENT_STATUS_CONFIG[req.display_status];
                                  const ReqIcon = statusConf.Icon;
                                  return (
                                    <div key={req.code} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all">
                                      <div className="flex items-center gap-3">
                                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${statusConf.iconClass}`}>
                                          <ReqIcon className="h-4 w-4" />
                                        </div>
                                        <div>
                                          <p className="font-medium text-gray-900 leading-tight">{req.label}</p>
                                          {req.latest_submission?.reviewed_at ? (
                                            <p className="mt-0.5 text-[11px] text-gray-500">
                                              Reviewed {formatDate(req.latest_submission.reviewed_at)}
                                            </p>
                                          ) : req.latest_submission?.created_at ? (
                                            <p className="mt-0.5 text-[11px] text-gray-500">
                                              Submitted {formatDate(req.latest_submission.created_at)}
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusConf.containerClass}`}>
                                          {statusConf.label}
                                        </span>
                                        {req.document_url && (
                                          <button
                                            type="button"
                                            onClick={() => setPreviewDoc({ url: req.document_url!, title: req.label })}
                                            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition hover:bg-gray-50 hover:text-gray-900"
                                            title="View Document"
                                          >
                                            <ExternalLink className="h-4 w-4" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body,
    )}

      <AnimatePresence>
        {previewDoc && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setPreviewDoc(null)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900">{previewDoc.title}</h3>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-100 p-6">
                {getPreviewKind(previewDoc.url) === 'image' ? (
                  <img
                    src={previewDoc.url}
                    alt={previewDoc.title}
                    className="max-h-full max-w-full rounded bg-white object-contain shadow-sm"
                  />
                ) : getPreviewKind(previewDoc.url) === 'pdf' ? (
                  <iframe
                    src={`${previewDoc.url}#toolbar=0`}
                    title={previewDoc.title}
                    className="h-full w-full rounded bg-white shadow-sm"
                  />
                ) : (
                  <div className="text-center">
                    <ExternalLink className="mx-auto mb-3 h-10 w-10 text-gray-400" />
                    <p className="mb-4 text-gray-600">Document preview unavailable</p>
                    <a
                      href={previewDoc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      Download File
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
