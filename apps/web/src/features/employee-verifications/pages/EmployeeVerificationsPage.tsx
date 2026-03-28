import { useCallback, useEffect, useMemo, useState } from 'react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { Input } from '@/shared/components/ui/Input';
import { api } from '@/shared/services/api.client';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { PERMISSIONS } from '@omnilert/shared';
import {
  resolveEmployeeVerificationTabAccess,
  type VerificationType,
} from './employeeVerificationTabAccess';
import {
  AlertCircle, Calendar, CheckCircle, ClipboardCheck, Clock,
  Copy, Check, CreditCard, ExternalLink, IdCard, Landmark,
  LayoutGrid, Mail, User, UserRoundPlus, Users, X, XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type VerificationStatus = 'pending' | 'approved' | 'rejected';

type VerificationData = {
  registration: any[];
  personalInformation: any[];
  employmentRequirements: any[];
  bankInformation: any[];
};

type AssignmentOptionBranch = {
  id: string;
  name: string;
  odoo_branch_id: string;
};

type AssignmentOptionCompany = {
  id: string;
  name: string;
  slug: string;
  branches: AssignmentOptionBranch[];
};

type RegistrationAssignmentOptions = {
  roles: Array<{ id: string; name: string; color?: string | null }>;
  companies: AssignmentOptionCompany[];
};

type SelectedItem = {
  type: VerificationType;
  data: any;
};

type ConfirmModalState = {
  action: 'approve' | 'reject';
  message: string;
  onConfirm: () => Promise<void>;
} | null;

/** Maps status to Badge variant prop */
function statusVariant(status: string): 'success' | 'danger' | 'warning' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

type StatusFilter = 'all' | VerificationStatus;

const STATUS_TABS: { id: StatusFilter; label: string; icon: LucideIcon }[] = [
  { id: 'all',      label: 'All',      icon: LayoutGrid  },
  { id: 'pending',  label: 'Pending',  icon: Clock       },
  { id: 'approved', label: 'Approved', icon: CheckCircle },
  { id: 'rejected', label: 'Rejected', icon: XCircle     },
];

type PersonalInfoKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'mobileNumber'
  | 'legalName'
  | 'birthday'
  | 'gender'
  | 'maritalStatus'
  | 'address'
  | 'sssNumber'
  | 'tinNumber'
  | 'pagibigNumber'
  | 'philhealthNumber'
  | 'emergencyContact'
  | 'emergencyPhone'
  | 'emergencyRelationship';

const PERSONAL_FIELD_ORDER: PersonalInfoKey[] = [
  'firstName',
  'lastName',
  'email',
  'mobileNumber',
  'legalName',
  'birthday',
  'gender',
  'maritalStatus',
  'address',
  'sssNumber',
  'tinNumber',
  'pagibigNumber',
  'philhealthNumber',
  'emergencyContact',
  'emergencyPhone',
  'emergencyRelationship',
];

const PERSONAL_FIELD_LABEL: Record<PersonalInfoKey, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  mobileNumber: 'Mobile Number',
  legalName: 'Legal Name',
  birthday: 'Birthday',
  gender: 'Gender',
  maritalStatus: 'Marital Status',
  address: 'Address',
  sssNumber: 'SSS Number',
  tinNumber: 'TIN Number',
  pagibigNumber: 'Pag-IBIG Number',
  philhealthNumber: 'PhilHealth Number',
  emergencyContact: 'Emergency Contact',
  emergencyPhone: 'Emergency Phone',
  emergencyRelationship: 'Relationship',
};

const BANK_LABEL: Record<number, string> = {
  2: 'Metrobank',
  3: 'Gcash',
  4: 'BDO',
  5: 'BPI',
  6: 'Maya',
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

function formatPersonalValue(key: PersonalInfoKey, value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (key === 'birthday') {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString();
    }
  }
  return String(value);
}

function normalizePersonalCompareValue(key: PersonalInfoKey, value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (key === 'email' || key === 'gender') {
    return raw.toLowerCase();
  }

  if (key === 'birthday') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  return raw;
}

/** Copy text to clipboard with an execCommand fallback for non-HTTPS environments. */
function copyToClipboard(text: string, onSuccess: () => void) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      fallbackCopy(text, onSuccess);
    });
  } else {
    fallbackCopy(text, onSuccess);
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

function getCurrentPersonalValue(item: any, key: PersonalInfoKey): unknown {
  if (!item) return null;
  if (key === 'firstName') return item.first_name;
  if (key === 'lastName') return item.last_name;
  if (key === 'email') return item.email;
  if (key === 'mobileNumber') return item.mobile_number;
  if (key === 'legalName') return item.legal_name;
  if (key === 'birthday') return item.birthday;
  if (key === 'gender') return item.gender;
  if (key === 'maritalStatus') return item.marital_status;
  if (key === 'address') return item.address;
  if (key === 'sssNumber') return item.sss_number;
  if (key === 'tinNumber') return item.tin_number;
  if (key === 'pagibigNumber') return item.pagibig_number;
  if (key === 'philhealthNumber') return item.philhealth_number;
  if (key === 'emergencyContact') return item.emergency_contact;
  if (key === 'emergencyPhone') return item.emergency_phone;
  return item.emergency_relationship;
}

function VerificationCard({
  type,
  item,
  onClick,
}: {
  type: VerificationType;
  item: any;
  onClick: () => void;
}) {
  /** Secondary line of metadata below the name */
  function subtitle() {
    if (type === 'registration') return item.email as string;
    if (type === 'personalInformation') return item.email as string;
    if (type === 'employmentRequirements') return item.requirement_label as string;
    return BANK_LABEL[Number(item.bank_id)] ?? `Bank ID ${String(item.bank_id)}`;
  }

  /** Tertiary line for bank cards */
  function subtitleExtra() {
    if (type === 'bankInformation' && item.account_number) {
      return `Account: ${String(item.account_number)}`;
    }
    return null;
  }

  const dateIso: string =
    type === 'registration' ? (item.requested_at as string) : (item.created_at as string);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <button
      type="button"
      className="flex h-full w-full flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30"
      onClick={onClick}
    >
      {/* Top block */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-gray-900">
          {String(item.first_name)} {String(item.last_name)}
        </p>
        <Badge variant={statusVariant(item.status as string)}>
          {(item.status as string).charAt(0).toUpperCase() + (item.status as string).slice(1)}
        </Badge>
      </div>

      <div className="mt-1.5 min-w-0 space-y-0.5">
        <p className="truncate text-xs text-gray-500">{subtitle()}</p>
        {subtitleExtra() && (
          <p className="truncate text-xs text-gray-400">{subtitleExtra()}</p>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-2.5">
        <p className="text-xs text-gray-400">{fmtDate(dateIso)}</p>
        <svg className="h-4 w-4 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}

function EmployeeVerificationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-pulse space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-gray-200" />
          <div className="h-7 w-64 rounded bg-gray-200" />
        </div>
        <div className="h-4 w-80 rounded bg-gray-200" />
      </div>
      {/* Category tabs */}
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[96, 112, 160, 120].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-8 animate-pulse rounded-t bg-gray-100" />
        ))}
      </div>
      {/* Status sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[64, 80, 96, 88].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-6 animate-pulse rounded-t bg-gray-100" />
        ))}
      </div>
      {/* Card grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-3 w-40 rounded bg-gray-200" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-200" />
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-2.5">
              <div className="h-3 w-28 rounded bg-gray-200" />
              <div className="h-4 w-4 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmployeeVerificationsPage() {
  const PAGE_SIZE = 10;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [activeType, setActiveType] = useState<VerificationType>('registration');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VerificationData>({
    registration: [],
    personalInformation: [],
    employmentRequirements: [],
    bankInformation: [],
  });
  const [assignmentOptions, setAssignmentOptions] = useState<RegistrationAssignmentOptions>({
    roles: [],
    companies: [],
  });
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [panelRejectMode, setPanelRejectMode] = useState(false);
  const [panelRejectReason, setPanelRejectReason] = useState('');
  const [panelError, setPanelError] = useState('');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [approvalLogs, setApprovalLogs] = useState<Array<{ createdAt: string; message: string }>>([]);
  const [approvalInProgressId, setApprovalInProgressId] = useState<string | null>(null);
  const [copiedAccountNumber, setCopiedAccountNumber] = useState(false);

  const [approveRoleIds, setApproveRoleIds] = useState<string[]>([]);
  const [approveCompanyIds, setApproveCompanyIds] = useState<string[]>([]);
  const [approveBranchIdsByCompany, setApproveBranchIdsByCompany] = useState<Record<string, string[]>>({});
  const [approveResidentCompanyId, setApproveResidentCompanyId] = useState('');
  const [approveResidentBranchId, setApproveResidentBranchId] = useState('');
  const [approveEmployeeNumber, setApproveEmployeeNumber] = useState('');
  const [approveUserKey, setApproveUserKey] = useState('');
  const [approveAvatarUrl, setApproveAvatarUrl] = useState('');
  const [approveAvatarUploading, setApproveAvatarUploading] = useState(false);
  const [personalInfoEdits, setPersonalInfoEdits] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    legalName: '',
    birthday: '',
    gender: '',
    maritalStatus: '',
    emergencyContact: '',
    emergencyPhone: '',
    emergencyRelationship: '',
    address: '',
    sssNumber: '',
    tinNumber: '',
    pagibigNumber: '',
    philhealthNumber: '',
  });
  const socket = useSocket('/employee-verifications');
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const { hasPermission } = usePermission();
  const canViewEmployeeVerificationPage = hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE);
  const canApproveRegistration = hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION);
  const canApprovePersonalInfo = hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_PERSONAL);
  const canApproveRequirements = hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS);
  const canApproveBankInfo = hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_BANK);
  const { visibleTypes, showNoDataPermissionState } = useMemo(
    () =>
      resolveEmployeeVerificationTabAccess({
        canApproveRegistration,
        canApprovePersonalInfo,
        canApproveRequirements,
        canApproveBankInfo,
        canViewEmployeeVerificationPage,
      }),
    [
      canApproveRegistration,
      canApprovePersonalInfo,
      canApproveRequirements,
      canApproveBankInfo,
      canViewEmployeeVerificationPage,
    ],
  );
  const visibleTypeSet = useMemo(() => new Set<VerificationType>(visibleTypes), [visibleTypes]);
  const categoryTabs = useMemo(
    () => ([
      { id: 'registration' as const, label: 'Registration', icon: UserRoundPlus },
      { id: 'personalInformation' as const, label: 'Personal Information', icon: IdCard },
      { id: 'employmentRequirements' as const, label: 'Employment Requirements', icon: ClipboardCheck },
      { id: 'bankInformation' as const, label: 'Bank Information', icon: Landmark },
    ]),
    [],
  );
  const visibleCategoryTabs = useMemo(
    () => categoryTabs.filter((tab) => visibleTypeSet.has(tab.id)),
    [categoryTabs, visibleTypeSet],
  );

  const listByType = useMemo(() => {
    if (!visibleTypeSet.has(activeType)) return [];
    if (activeType === 'registration') return data.registration;
    if (activeType === 'personalInformation') return data.personalInformation;
    if (activeType === 'employmentRequirements') return data.employmentRequirements;
    return data.bankInformation;
  }, [activeType, data, visibleTypeSet]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return listByType;
    return listByType.filter((row) => row.status === statusFilter);
  }, [listByType, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedFiltered = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pendingCount = useMemo(
    () =>
      data.registration.filter((row) => row.status === 'pending').length +
      data.personalInformation.filter((row) => row.status === 'pending').length +
      data.employmentRequirements.filter((row) => row.status === 'pending').length +
      data.bankInformation.filter((row) => row.status === 'pending').length,
    [data],
  );

  const canApproveType = (type: VerificationType) => {
    if (type === 'registration') return canApproveRegistration;
    if (type === 'personalInformation') return canApprovePersonalInfo;
    if (type === 'employmentRequirements') return canApproveRequirements;
    return canApproveBankInfo;
  };

  const canActOnSelected = !!selectedItem
    && selectedItem.data.status === 'pending'
    && canApproveType(selectedItem.type);

  const activeTypeLabel =
    activeType === 'registration'
      ? 'Registration'
      : activeType === 'personalInformation'
        ? 'Personal Information'
        : activeType === 'employmentRequirements'
          ? 'Employment Requirements'
          : 'Bank Information';

  useEffect(() => {
    setPage(1);
  }, [activeType, statusFilter]);

  useEffect(() => {
    if (visibleTypes.length === 0) return;
    if (!visibleTypeSet.has(activeType)) {
      setActiveType(visibleTypes[0]);
      setStatusFilter('pending');
    }
  }, [activeType, visibleTypeSet, visibleTypes]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const [verificationsRes, optionsRes] = await Promise.all([
        api.get('/employee-verifications'),
        canApproveRegistration
          ? api.get('/employee-verifications/registration/assignment-options')
          : Promise.resolve({ data: { data: { roles: [], companies: [] } } }),
      ]);

      setData(
        verificationsRes.data.data || {
          registration: [],
          personalInformation: [],
          employmentRequirements: [],
          bankInformation: [],
        },
      );
      setAssignmentOptions(
        optionsRes.data.data || {
          roles: [],
          companies: [],
        },
      );
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to load employee verifications');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [canApproveRegistration, showErrorToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;

    const onUpdated = () => {
      fetchData({ silent: true });
    };
    const onApprovalProgress = (payload: {
      verificationId: string;
      verificationType: 'registration';
      reviewerId: string;
      message: string;
      createdAt: string;
    }) => {
      if (payload.verificationType !== 'registration') return;
      if (!selectedItem || selectedItem.type !== 'registration') return;
      if (payload.verificationId !== selectedItem.data.id) return;
      if (currentUserId && payload.reviewerId !== currentUserId) return;
      setApprovalLogs((prev) => [...prev, { createdAt: payload.createdAt, message: payload.message }]);
    };

    socket.on('employee-verification:updated', onUpdated);
    socket.on('employee-verification:approval-progress', onApprovalProgress);

    return () => {
      socket.off('employee-verification:updated', onUpdated);
      socket.off('employee-verification:approval-progress', onApprovalProgress);
    };
  }, [socket, fetchData, selectedItem, currentUserId]);

  const openPanel = (type: VerificationType, item: any) => {
    setSelectedItem({ type, data: item });
    setPanelRejectMode(false);
    setPanelRejectReason('');
    setPanelError('');
    setApprovalLogs([]);
    setApprovalInProgressId(null);
    setCopiedAccountNumber(false);

    if (type === 'registration') {
      setApproveRoleIds([]);
      setApproveCompanyIds([]);
      setApproveBranchIdsByCompany({});
      setApproveResidentCompanyId('');
      setApproveResidentBranchId('');
      setApproveEmployeeNumber('');
      setApproveUserKey('');
      setApproveAvatarUrl('');
      setApproveAvatarUploading(false);
    }

    if (type === 'personalInformation') {
      const requested = item.requested_changes || {};
      setPersonalInfoEdits({
        firstName: requested.firstName || '',
        lastName: requested.lastName || '',
        email: requested.email || '',
        mobileNumber: requested.mobileNumber || '',
        legalName: requested.legalName || '',
        birthday: requested.birthday || '',
        gender: requested.gender || '',
        maritalStatus: requested.maritalStatus || '',
        address: requested.address || '',
        sssNumber: requested.sssNumber || '',
        tinNumber: requested.tinNumber || '',
        pagibigNumber: requested.pagibigNumber || '',
        philhealthNumber: requested.philhealthNumber || '',
        emergencyContact: requested.emergencyContact || '',
        emergencyPhone: requested.emergencyPhone || '',
        emergencyRelationship: requested.emergencyRelationship || '',
      });
    }
  };

  const closePanel = () => {
    setSelectedItem(null);
    setPanelRejectMode(false);
    setPanelRejectReason('');
    setPanelError('');
    setConfirmModal(null);
    setApprovalLogs([]);
    setApprovalInProgressId(null);
    setApproveEmployeeNumber('');
    setApproveUserKey('');
    setApproveAvatarUrl('');
    setApproveAvatarUploading(false);
  };

  useEffect(() => {
    if (!selectedItem) return;
    const source = selectedItem.type === 'registration'
      ? data.registration
      : selectedItem.type === 'personalInformation'
        ? data.personalInformation
        : selectedItem.type === 'employmentRequirements'
          ? data.employmentRequirements
          : data.bankInformation;
    const refreshed = source.find((row: any) => row.id === selectedItem.data.id);
    if (!refreshed) {
      closePanel();
      return;
    }
    setSelectedItem((prev) => (prev ? { ...prev, data: refreshed } : prev));
  }, [data, selectedItem?.data?.id, selectedItem?.type]);

  const selectedRequestedChanges = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'personalInformation') return {};
    return (selectedItem.data.requested_changes || {}) as Partial<Record<PersonalInfoKey, unknown>>;
  }, [selectedItem]);

  const personalChangedKeys = useMemo(() => {
    const keys = Object.keys(selectedRequestedChanges) as PersonalInfoKey[];
    return PERSONAL_FIELD_ORDER.filter((key) => {
      if (!keys.includes(key)) return false;
      const requested = normalizePersonalCompareValue(key, selectedRequestedChanges[key]);
      if (!requested) return false;
      // For resolved items the user's profile may already reflect the change —
      // show all keys from requested_changes without comparing to current values.
      if (selectedItem?.data?.status !== 'pending') return true;
      const current = normalizePersonalCompareValue(
        key,
        getCurrentPersonalValue(selectedItem?.data, key),
      );
      return requested !== current;
    });
  }, [selectedRequestedChanges, selectedItem?.data]);

  const toggleSelection = (
    list: string[],
    setList: (next: string[]) => void,
    id: string,
  ) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  const toggleCompanySelection = (companyId: string) => {
    setApproveCompanyIds((prev) => {
      const isSelected = prev.includes(companyId);
      if (isSelected) {
        setApproveBranchIdsByCompany((prevBranches) => {
          const next = { ...prevBranches };
          delete next[companyId];
          return next;
        });
        if (approveResidentCompanyId === companyId) {
          setApproveResidentCompanyId('');
          setApproveResidentBranchId('');
        }
        return prev.filter((id) => id !== companyId);
      }
      return [...prev, companyId];
    });
  };

  const toggleCompanyBranchSelection = (companyId: string, branchId: string) => {
    setApproveBranchIdsByCompany((prev) => {
      const existing = prev[companyId] ?? [];
      const nextForCompany = existing.includes(branchId)
        ? existing.filter((id) => id !== branchId)
        : [...existing, branchId];

      const next = { ...prev, [companyId]: nextForCompany };
      if (nextForCompany.length === 0) {
        delete next[companyId];
      }
      if (
        approveResidentCompanyId === companyId
        && approveResidentBranchId
        && !nextForCompany.includes(approveResidentBranchId)
      ) {
        setApproveResidentCompanyId('');
        setApproveResidentBranchId('');
      }
      return next;
    });
  };

  const uploadRegistrationAvatar = useCallback(async (file: File) => {
    if (!selectedItem || selectedItem.type !== 'registration') return;

    setPanelError('');
    setApproveAvatarUploading(true);
    try {
      const normalized = await normalizeFileForUpload(file);
      const formData = new FormData();
      formData.append('avatar', normalized, normalized.name || 'avatar.jpg');

      const response = await api.post(
        `/employee-verifications/registration/${selectedItem.data.id}/avatar`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );

      const avatarUrl = String(response.data?.data?.avatar_url ?? '').trim();
      if (!avatarUrl) {
        throw new Error('Avatar upload response is missing URL');
      }
      setApproveAvatarUrl(avatarUrl);
      showSuccessToast('Profile picture uploaded.');
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to upload profile picture');
    } finally {
      setApproveAvatarUploading(false);
    }
  }, [selectedItem, showErrorToast, showSuccessToast]);

  const approveSelected = async () => {
    if (!selectedItem) return;

    setPanelError('');
    setSaving(true);
    const currentType = selectedItem.type;
    const currentId = selectedItem.data.id as string;
    if (currentType === 'registration') {
      setApprovalInProgressId(currentId);
      setApprovalLogs((prev) => [
        ...prev,
        { createdAt: new Date().toISOString(), message: 'Approval request sent. Waiting for backend steps...' },
      ]);
    }
    try {
      if (selectedItem.type === 'registration') {
        if (approveRoleIds.length === 0) {
          setPanelError('Select at least one role.');
          setSaving(false);
          return;
        }

        if (approveCompanyIds.length === 0) {
          setPanelError('Select at least one company.');
          setSaving(false);
          return;
        }

        const companyAssignments = approveCompanyIds.map((companyId) => ({
          companyId,
          branchIds: approveBranchIdsByCompany[companyId] ?? [],
        }));

        const invalidCompany = companyAssignments.find((assignment) => assignment.branchIds.length === 0);
        if (invalidCompany) {
          const companyName = assignmentOptions.companies.find((item) => item.id === invalidCompany.companyId)?.name
            ?? 'selected company';
          setPanelError(`Select at least one branch for ${companyName}.`);
          setSaving(false);
          return;
        }

        if (!approveResidentCompanyId || !approveResidentBranchId) {
          setPanelError('Select a resident branch.');
          setSaving(false);
          return;
        }

        const residentBranchIsSelected = (approveBranchIdsByCompany[approveResidentCompanyId] ?? [])
          .includes(approveResidentBranchId);
        if (!residentBranchIsSelected) {
          setPanelError('Resident branch must be part of selected branches.');
          setSaving(false);
          return;
        }
        if (approveAvatarUploading) {
          setPanelError('Please wait for the profile picture upload to finish.');
          setSaving(false);
          return;
        }

        await api.post(`/employee-verifications/registration/${selectedItem.data.id}/approve`, {
          roleIds: approveRoleIds,
          companyAssignments,
          residentBranch: {
            companyId: approveResidentCompanyId,
            branchId: approveResidentBranchId,
          },
          ...(approveEmployeeNumber.trim()
            ? { employeeNumber: parseInt(approveEmployeeNumber, 10) }
            : {}),
          ...(approveUserKey.trim() ? { userKey: approveUserKey.trim() } : {}),
          ...(approveAvatarUrl.trim() ? { avatarUrl: approveAvatarUrl.trim() } : {}),
        });
      } else if (selectedItem.type === 'personalInformation') {
        const payload: Record<string, unknown> = {};
        if (personalChangedKeys.includes('firstName')) payload.firstName = personalInfoEdits.firstName;
        if (personalChangedKeys.includes('lastName')) payload.lastName = personalInfoEdits.lastName;
        if (personalChangedKeys.includes('email')) payload.email = personalInfoEdits.email;
        if (personalChangedKeys.includes('mobileNumber')) payload.mobileNumber = personalInfoEdits.mobileNumber;
        if (personalChangedKeys.includes('legalName')) payload.legalName = personalInfoEdits.legalName;
        if (personalChangedKeys.includes('birthday')) payload.birthday = personalInfoEdits.birthday || null;
        if (personalChangedKeys.includes('gender')) payload.gender = personalInfoEdits.gender || null;
        if (personalChangedKeys.includes('maritalStatus')) payload.maritalStatus = personalInfoEdits.maritalStatus;
        if (personalChangedKeys.includes('address')) payload.address = personalInfoEdits.address;
        if (personalChangedKeys.includes('sssNumber')) payload.sssNumber = personalInfoEdits.sssNumber;
        if (personalChangedKeys.includes('tinNumber')) payload.tinNumber = personalInfoEdits.tinNumber;
        if (personalChangedKeys.includes('pagibigNumber')) payload.pagibigNumber = personalInfoEdits.pagibigNumber;
        if (personalChangedKeys.includes('philhealthNumber')) payload.philhealthNumber = personalInfoEdits.philhealthNumber;
        if (personalChangedKeys.includes('emergencyContact')) payload.emergencyContact = personalInfoEdits.emergencyContact;
        if (personalChangedKeys.includes('emergencyPhone')) payload.emergencyPhone = personalInfoEdits.emergencyPhone;
        if (personalChangedKeys.includes('emergencyRelationship')) {
          payload.emergencyRelationship = personalInfoEdits.emergencyRelationship;
        }
        await api.post(
          `/employee-verifications/personal-information/${selectedItem.data.id}/approve`,
          payload,
        );
      } else {
        if (selectedItem.type === 'employmentRequirements') {
          await api.post(
            `/employee-verifications/employment-requirements/${selectedItem.data.id}/approve`,
          );
        } else {
          await api.post(
            `/employee-verifications/bank-information/${selectedItem.data.id}/approve`,
          );
        }
      }

      showSuccessToast('Verification approved.');
      closePanel();
      await fetchData();
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to approve verification');
      if (currentType === 'registration') {
        setApprovalLogs((prev) => [
          ...prev,
          { createdAt: new Date().toISOString(), message: `Failed: ${err.response?.data?.error || 'Unknown error'}` },
        ]);
      }
    } finally {
      setSaving(false);
      if (currentType === 'registration') {
        setApprovalInProgressId(null);
      }
    }
  };

  const rejectSelected = async () => {
    if (!selectedItem) return;
    if (!panelRejectReason.trim()) {
      setPanelError('Rejection reason is required.');
      return;
    }

    setPanelError('');
    setSaving(true);
    try {
      const body = { reason: panelRejectReason.trim() };
      if (selectedItem.type === 'registration') {
        await api.post(`/employee-verifications/registration/${selectedItem.data.id}/reject`, body);
      } else if (selectedItem.type === 'personalInformation') {
        await api.post(
          `/employee-verifications/personal-information/${selectedItem.data.id}/reject`,
          body,
        );
      } else {
        if (selectedItem.type === 'employmentRequirements') {
          await api.post(
            `/employee-verifications/employment-requirements/${selectedItem.data.id}/reject`,
            body,
          );
        } else {
          await api.post(
            `/employee-verifications/bank-information/${selectedItem.data.id}/reject`,
            body,
          );
        }
      }

      showSuccessToast('Verification rejected.');
      closePanel();
      await fetchData();
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to reject verification');
    } finally {
      setSaving(false);
    }
  };

  const PANEL_TITLE: Record<VerificationType, string> = {
    registration: 'Registration Verification',
    personalInformation: 'Personal Information Verification',
    employmentRequirements: 'Employment Requirement Verification',
    bankInformation: 'Bank Information Verification',
  };

  const PANEL_ICON: Record<VerificationType, React.ElementType> = {
    registration: UserRoundPlus,
    personalInformation: IdCard,
    employmentRequirements: ClipboardCheck,
    bankInformation: Landmark,
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Employee Verifications</h1>
          </div>
          <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
            {showNoDataPermissionState ? 'No Accessible Verification Data' : activeTypeLabel}
          </p>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            Review and act on employee verification submissions.
          </p>
        </div>

        {/* Per-category pending counts for the visible tabs */}
        {visibleCategoryTabs.length > 0 && (() => {
          const pendingByType: Record<VerificationType, number> = {
            registration: data.registration.filter((r) => r.status === 'pending').length,
            personalInformation: data.personalInformation.filter((r) => r.status === 'pending').length,
            employmentRequirements: data.employmentRequirements.filter((r) => r.status === 'pending').length,
            bankInformation: data.bankInformation.filter((r) => r.status === 'pending').length,
          };
          return (
          <ViewToggle
            options={visibleCategoryTabs.map((tab) => ({
              ...tab,
              label: (
                <div className="flex items-center gap-2">
                  <span>{tab.label}</span>
                  {pendingByType[tab.id] > 0 && (
                    <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[9px] font-bold text-white">
                      {pendingByType[tab.id]}
                    </span>
                  )}
                </div>
              ),
            }))}
            activeId={activeType}
            onChange={(id) => {
              setActiveType(id);
              setStatusFilter('pending');
            }}
            layoutId="verification-category-tabs"
          />
          );
        })()}

        {showNoDataPermissionState ? (
          <div className="flex min-h-[18rem] items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-10">
            <div className="text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">No Accessible Verification Data</p>
              <p className="mt-1 text-sm text-gray-500">You have no permission to view data.</p>
            </div>
          </div>
        ) : (
          <>
            <ViewToggle
              options={STATUS_TABS}
              activeId={statusFilter}
              onChange={(id) => {
                setStatusFilter(id);
                setPage(1);
              }}
              layoutId="verification-status-tabs"
            />

            <div className="space-y-4">
              {loading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-1.5">
                          <div className="h-4 w-32 rounded bg-gray-200" />
                          <div className="h-3 w-40 rounded bg-gray-200" />
                        </div>
                        <div className="h-5 w-16 rounded-full bg-gray-200" />
                      </div>
                      <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-2.5">
                        <div className="h-3 w-28 rounded bg-gray-200" />
                        <div className="h-4 w-4 rounded bg-gray-200" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
                  {activeType === 'registration' && <UserRoundPlus className="h-4 w-4 shrink-0 text-gray-300" />}
                  {activeType === 'personalInformation' && <IdCard className="h-4 w-4 shrink-0 text-gray-300" />}
                  {activeType === 'employmentRequirements' && <ClipboardCheck className="h-4 w-4 shrink-0 text-gray-300" />}
                  {activeType === 'bankInformation' && <Landmark className="h-4 w-4 shrink-0 text-gray-300" />}
                  <p className="text-sm text-gray-400">
                    {statusFilter === 'all'
                      ? `No ${activeTypeLabel.toLowerCase()} verifications yet.`
                      : `No ${statusFilter} ${activeTypeLabel.toLowerCase()} verifications.`}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {pagedFiltered.map((item: any) => (
                      <VerificationCard
                        key={item.id}
                        type={activeType}
                        item={item}
                        onClick={() => openPanel(activeType, item)}
                      />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between text-sm text-gray-600">
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
                </>
              )}
            </div>
          </>
        )}
      </div>

      {createPortal(
        <>
          {selectedItem && (
            <div className="fixed inset-0 z-40 bg-black/30" onClick={closePanel} />
          )}

          <div
            className={`fixed inset-y-0 right-0 z-50 w-full max-w-[520px] transform bg-white shadow-2xl transition-transform duration-300 ${
              selectedItem ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {selectedItem && (
          <div className="flex h-full flex-col">
            {(() => {
              const PanelIcon = PANEL_ICON[selectedItem.type];
              return (
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <PanelIcon className="h-5 w-5 text-primary-600" />
                    <div>
                      <h2 className="text-base font-semibold text-gray-900">
                        {PANEL_TITLE[selectedItem.type]}
                      </h2>
                      <p className="text-xs text-gray-500">
                        {String(selectedItem.data.first_name)} {String(selectedItem.data.last_name)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(selectedItem.data.status as string)}>
                      {(selectedItem.data.status as string).charAt(0).toUpperCase() +
                       (selectedItem.data.status as string).slice(1)}
                    </Badge>
                    <button
                      type="button"
                      onClick={closePanel}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              );
            })()}

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
              {selectedItem.type === 'registration' && (
                <>
                  {/* Rejection callout */}
                  {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
                        <p className="mt-0.5 text-sm text-red-600">{String(selectedItem.data.rejection_reason)}</p>
                      </div>
                    </div>
                  )}

                  {/* Employee section */}
                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Employee</h3>
                    <dl className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Email</dt>
                          <dd className="text-sm font-medium text-gray-900">{String(selectedItem.data.email)}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Requested</dt>
                          <dd className="text-sm text-gray-900">
                            {new Date(selectedItem.data.requested_at as string).toLocaleString()}
                          </dd>
                        </div>
                      </div>
                      {selectedItem.data.reviewed_at && (
                        <div className="flex items-start gap-2">
                          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div>
                            <dt className="text-xs text-gray-500">Reviewed</dt>
                            <dd className="text-sm text-gray-900">
                              {new Date(selectedItem.data.reviewed_at as string).toLocaleString()}
                            </dd>
                          </div>
                        </div>
                      )}
                      {(selectedItem.data.status === 'approved' || selectedItem.data.status === 'rejected')
                        && selectedItem.data.reviewed_by_name && (
                        <div className="flex items-start gap-2">
                          <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div>
                            <dt className="text-xs text-gray-500">
                              {selectedItem.data.status === 'approved' ? 'Approved By' : 'Rejected By'}
                            </dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {String(selectedItem.data.reviewed_by_name)}
                            </dd>
                          </div>
                        </div>
                      )}
                    </dl>
                  </section>

                  {canActOnSelected && (
                    <>
                    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <label className="block text-sm font-medium text-gray-700">
                          Profile Picture{' '}
                          <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <div className="flex items-center gap-3">
                          <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                            {approveAvatarUploading ? 'Uploading...' : 'Choose image'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                              className="hidden"
                              disabled={approveAvatarUploading || saving}
                              onChange={async (event) => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                if (!file) return;
                                await uploadRegistrationAvatar(file);
                              }}
                            />
                          </label>
                          {approveAvatarUrl && (
                            <button
                              type="button"
                              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                              onClick={() => setApproveAvatarUrl('')}
                              disabled={approveAvatarUploading || saving}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        {approveAvatarUrl ? (
                          <img
                            src={approveAvatarUrl}
                            alt="Uploaded registration profile"
                            className="h-24 w-24 rounded-full border border-gray-200 object-cover"
                          />
                        ) : (
                          <p className="text-xs text-gray-500">No image uploaded.</p>
                        )}
                      </div>

                      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <label className="block text-sm font-medium text-gray-700">
                          Employee Number{' '}
                          <span className="font-normal text-gray-400">(optional — auto-assigned if blank)</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={approveEmployeeNumber}
                          onChange={(e) => setApproveEmployeeNumber(e.target.value)}
                          placeholder="e.g. 4"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>

                      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <label className="block text-sm font-medium text-gray-700">
                          User Key{' '}
                          <span className="font-normal text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="text"
                          value={approveUserKey}
                          onChange={(e) => setApproveUserKey(e.target.value)}
                          placeholder="e.g. 7ceced51-2dc6-49fa-a38f-8798978f8763"
                          autoComplete="off"
                          spellCheck={false}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>

                      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <label className="block text-sm font-medium text-gray-700">
                          Roles (required)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {assignmentOptions.roles.map((role) => (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() =>
                                toggleSelection(approveRoleIds, setApproveRoleIds, role.id)
                              }
                              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                                approveRoleIds.includes(role.id)
                                  ? 'text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                              style={
                                approveRoleIds.includes(role.id)
                                  ? { backgroundColor: role.color || '#2563eb' }
                                  : {}
                              }
                            >
                              {role.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <label className="block text-sm font-medium text-gray-700">Companies and Branches (required)</label>
                        <div className="space-y-3">
                          {assignmentOptions.companies.map((company) => {
                            const selected = approveCompanyIds.includes(company.id);
                            const selectedBranchIds = approveBranchIdsByCompany[company.id] ?? [];
                            return (
                              <div key={company.id} className="rounded border border-gray-200 bg-white p-2">
                                <button
                                  type="button"
                                  onClick={() => toggleCompanySelection(company.id)}
                                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                    selected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  {company.name}
                                </button>
                                {selected && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {company.branches.map((branch) => (
                                      <button
                                        key={branch.id}
                                        type="button"
                                        onClick={() => toggleCompanyBranchSelection(company.id, branch.id)}
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                          selectedBranchIds.includes(branch.id)
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                      >
                                        {branch.name}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <label className="block text-sm font-medium text-gray-700">Resident Branch (required)</label>
                        <select
                          value={approveResidentBranchId ? `${approveResidentCompanyId}:${approveResidentBranchId}` : ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) {
                              setApproveResidentCompanyId('');
                              setApproveResidentBranchId('');
                              return;
                            }
                            const [companyId, branchId] = value.split(':');
                            setApproveResidentCompanyId(companyId || '');
                            setApproveResidentBranchId(branchId || '');
                          }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        >
                          <option value="">Select resident branch</option>
                          {approveCompanyIds.flatMap((companyId) => {
                            const company = assignmentOptions.companies.find((item) => item.id === companyId);
                            if (!company) return [];
                            const selectedBranchIds = approveBranchIdsByCompany[companyId] ?? [];
                            return company.branches
                              .filter((branch) => selectedBranchIds.includes(branch.id))
                              .map((branch) => (
                                <option key={`${company.id}-${branch.id}`} value={`${company.id}:${branch.id}`}>
                                  {company.name} - {branch.name}
                                </option>
                              ));
                          })}
                        </select>
                      </div>

                      {(approvalLogs.length > 0 || approvalInProgressId === selectedItem.data.id) && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                            Approval Progress
                          </p>
                          <div className="max-h-36 space-y-1 overflow-y-auto rounded bg-white p-2">
                            {approvalLogs.length === 0 && (
                              <p className="text-xs text-gray-500">Waiting for backend progress events...</p>
                            )}
                            {approvalLogs.map((log, idx) => (
                              <p key={`${log.createdAt}-${idx}`} className="text-xs text-gray-700">
                                <span className="mr-2 font-medium text-gray-500">
                                  {new Date(log.createdAt).toLocaleTimeString()}
                                </span>
                                {log.message}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {selectedItem.type === 'personalInformation' && (
                <>
                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Employee</h3>
                    <dl className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Email</dt>
                          <dd className="text-sm font-medium text-gray-900">{String(selectedItem.data.email)}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Submitted</dt>
                          <dd className="text-sm text-gray-900">
                            {new Date(selectedItem.data.created_at as string).toLocaleString()}
                          </dd>
                        </div>
                      </div>
                      {(selectedItem.data.status === 'approved' || selectedItem.data.status === 'rejected')
                        && selectedItem.data.reviewed_by_name && (
                        <div className="flex items-start gap-2">
                          <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div>
                            <dt className="text-xs text-gray-500">
                              {selectedItem.data.status === 'approved' ? 'Approved By' : 'Rejected By'}
                            </dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {String(selectedItem.data.reviewed_by_name)}
                            </dd>
                          </div>
                        </div>
                      )}
                    </dl>
                  </section>

                  {selectedItem.data.valid_id_url && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Submitted ID</p>
                      {getPreviewKind(selectedItem.data.valid_id_url) === 'image' && (
                        <img
                          src={selectedItem.data.valid_id_url}
                          alt="Submitted valid ID"
                          className="max-h-60 w-full rounded-lg border border-gray-200 object-contain"
                        />
                      )}
                      {getPreviewKind(selectedItem.data.valid_id_url) === 'pdf' && (
                        <div className="h-64 overflow-hidden rounded-lg border border-gray-200">
                          <iframe
                            src={selectedItem.data.valid_id_url}
                            title="Submitted valid ID PDF"
                            className="h-full w-full"
                          />
                        </div>
                      )}
                      {getPreviewKind(selectedItem.data.valid_id_url) === 'other' && (
                        <a
                          href={selectedItem.data.valid_id_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                        >
                          Open submitted ID <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
                        <p className="mt-0.5 text-sm text-red-600">{String(selectedItem.data.rejection_reason)}</p>
                      </div>
                    </div>
                  )}

                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Requested Changes
                    </h3>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="space-y-2 text-sm text-gray-800">
                        {personalChangedKeys.length === 0 && (
                          <p className="text-gray-500">No requested changes.</p>
                        )}
                        {personalChangedKeys.map((key) => {
                          const original = getCurrentPersonalValue(selectedItem.data, key);
                          const approvedChanges = (selectedItem.data.approved_changes || {}) as Record<string, unknown>;
                          const next = canActOnSelected
                            ? personalInfoEdits[key]
                            : (approvedChanges[key] ?? selectedRequestedChanges[key]);

                          return (
                            <div key={key} className="flex flex-wrap items-baseline gap-1.5">
                              <span className="font-medium text-gray-700">{PERSONAL_FIELD_LABEL[key]}:</span>
                              <span className="text-gray-400 line-through">{formatPersonalValue(key, original)}</span>
                              <span className="text-gray-400">→</span>
                              <span className="font-semibold text-gray-900">{formatPersonalValue(key, next)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>

                  {canActOnSelected && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {personalChangedKeys.includes('firstName') && (
                        <Input
                          label="First Name"
                          value={personalInfoEdits.firstName}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, firstName: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('lastName') && (
                        <Input
                          label="Last Name"
                          value={personalInfoEdits.lastName}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, lastName: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('email') && (
                        <Input
                          label="Email"
                          type="email"
                          value={personalInfoEdits.email}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, email: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('mobileNumber') && (
                        <Input
                          label="Mobile Number"
                          value={personalInfoEdits.mobileNumber}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({
                              ...prev,
                              mobileNumber: e.target.value,
                            }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('legalName') && (
                        <Input
                          label="Legal Name"
                          value={personalInfoEdits.legalName}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, legalName: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('birthday') && (
                        <Input
                          label="Birthday"
                          type="date"
                          value={personalInfoEdits.birthday}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, birthday: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('gender') && (
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-700">Gender</label>
                          <select
                            value={personalInfoEdits.gender}
                            onChange={(e) =>
                              setPersonalInfoEdits((prev) => ({ ...prev, gender: e.target.value }))
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          >
                            <option value="">Select gender</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      )}
                      {personalChangedKeys.includes('address') && (
                        <Input
                          label="Address"
                          value={personalInfoEdits.address}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, address: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('maritalStatus') && (
                        <Input
                          label="Marital Status"
                          value={personalInfoEdits.maritalStatus}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, maritalStatus: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('sssNumber') && (
                        <Input
                          label="SSS Number"
                          value={personalInfoEdits.sssNumber}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, sssNumber: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('tinNumber') && (
                        <Input
                          label="TIN Number"
                          value={personalInfoEdits.tinNumber}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, tinNumber: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('pagibigNumber') && (
                        <Input
                          label="Pag-IBIG Number"
                          value={personalInfoEdits.pagibigNumber}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, pagibigNumber: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('philhealthNumber') && (
                        <Input
                          label="PhilHealth Number"
                          value={personalInfoEdits.philhealthNumber}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, philhealthNumber: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('emergencyContact') && (
                        <Input
                          label="Emergency Contact"
                          value={personalInfoEdits.emergencyContact}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, emergencyContact: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('emergencyPhone') && (
                        <Input
                          label="Emergency Phone"
                          value={personalInfoEdits.emergencyPhone}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({ ...prev, emergencyPhone: e.target.value }))
                          }
                        />
                      )}
                      {personalChangedKeys.includes('emergencyRelationship') && (
                        <Input
                          label="Relationship"
                          value={personalInfoEdits.emergencyRelationship}
                          onChange={(e) =>
                            setPersonalInfoEdits((prev) => ({
                              ...prev,
                              emergencyRelationship: e.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                  )}
                </>
              )}

              {selectedItem.type === 'employmentRequirements' && (
                <>
                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Details</h3>
                    <dl className="space-y-3">
                      <div className="flex items-start gap-2">
                        <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Requirement</dt>
                          <dd className="text-sm font-medium text-gray-900">
                            {String(selectedItem.data.requirement_label)}
                          </dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Email</dt>
                          <dd className="text-sm font-medium text-gray-900">{String(selectedItem.data.email)}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Submitted</dt>
                          <dd className="text-sm text-gray-900">
                            {new Date(selectedItem.data.created_at as string).toLocaleString()}
                          </dd>
                        </div>
                      </div>
                      {(selectedItem.data.status === 'approved' || selectedItem.data.status === 'rejected')
                        && selectedItem.data.reviewed_by_name && (
                        <div className="flex items-start gap-2">
                          <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div>
                            <dt className="text-xs text-gray-500">
                              {selectedItem.data.status === 'approved' ? 'Approved By' : 'Rejected By'}
                            </dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {String(selectedItem.data.reviewed_by_name)}
                            </dd>
                          </div>
                        </div>
                      )}
                    </dl>
                  </section>

                  {selectedItem.data.document_url && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Submitted Document
                      </p>
                      {getPreviewKind(selectedItem.data.document_url) === 'image' && (
                        <img
                          src={selectedItem.data.document_url}
                          alt="Submitted employment requirement"
                          className="max-h-60 w-full rounded-lg border border-gray-200 object-contain"
                        />
                      )}
                      {getPreviewKind(selectedItem.data.document_url) === 'pdf' && (
                        <div className="h-64 overflow-hidden rounded-lg border border-gray-200">
                          <iframe
                            src={selectedItem.data.document_url}
                            title="Submitted employment requirement PDF"
                            className="h-full w-full"
                          />
                        </div>
                      )}
                      {getPreviewKind(selectedItem.data.document_url) === 'other' && (
                        <a
                          href={selectedItem.data.document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                        >
                          Open document <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
                        <p className="mt-0.5 text-sm text-red-600">{String(selectedItem.data.rejection_reason)}</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedItem.type === 'bankInformation' && (
                <>
                  {/* Rejection callout */}
                  {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
                        <p className="mt-0.5 text-sm text-red-600">
                          {String(selectedItem.data.rejection_reason)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Bank Details section */}
                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Bank Details
                    </h3>
                    <dl className="space-y-3">
                      <div className="flex items-start gap-2">
                        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Email</dt>
                          <dd className="text-sm font-medium text-gray-900">{String(selectedItem.data.email)}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Bank</dt>
                          <dd className="text-sm font-medium text-gray-900">
                            {BANK_LABEL[Number(selectedItem.data.bank_id)] ?? `Bank ID ${String(selectedItem.data.bank_id)}`}
                          </dd>
                        </div>
                      </div>
                      {selectedItem.data.account_number && (
                        <div className="flex items-start gap-2">
                          <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div>
                            <dt className="text-xs text-gray-500">Account Number</dt>
                            <dd className="flex items-center gap-1.5">
                              <span className="font-mono text-sm text-gray-900">
                                {String(selectedItem.data.account_number)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(String(selectedItem.data.account_number), () => {
                                    setCopiedAccountNumber(true);
                                    setTimeout(() => setCopiedAccountNumber(false), 2000);
                                  })
                                }
                                className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                title="Copy account number"
                              >
                                {copiedAccountNumber
                                  ? <Check className="h-3.5 w-3.5 text-green-500" />
                                  : <Copy className="h-3.5 w-3.5" />
                                }
                              </button>
                            </dd>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Submitted</dt>
                          <dd className="text-sm text-gray-900">
                            {new Date(selectedItem.data.created_at as string).toLocaleString()}
                          </dd>
                        </div>
                      </div>
                      {(selectedItem.data.status === 'approved' || selectedItem.data.status === 'rejected')
                        && selectedItem.data.reviewed_by_name && (
                        <div className="flex items-start gap-2">
                          <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div>
                            <dt className="text-xs text-gray-500">
                              {selectedItem.data.status === 'approved' ? 'Approved By' : 'Rejected By'}
                            </dt>
                            <dd className="text-sm font-medium text-gray-900">
                              {String(selectedItem.data.reviewed_by_name)}
                            </dd>
                          </div>
                        </div>
                      )}
                    </dl>
                  </section>
                </>
              )}
            </div>

            {canActOnSelected && (
              <div className="border-t border-gray-200 px-6 py-4">
                {panelError && (
                  <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{panelError}</p>
                )}

                {!panelRejectMode ? (
                  <div className="flex gap-3">
                    <Button
                      className="flex-1"
                      variant="success"
                      disabled={saving}
                      onClick={() =>
                        setConfirmModal({
                          action: 'approve',
                          message: 'Confirm approval of this verification?',
                          onConfirm: approveSelected,
                        })
                      }
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </span>
                    </Button>
                    <Button
                      className="flex-1"
                      variant="danger"
                      disabled={saving}
                      onClick={() => setPanelRejectMode(true)}
                    >
                      <span className="flex items-center justify-center gap-1.5">
                        <XCircle className="h-4 w-4" />
                        Reject
                      </span>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <textarea
                      rows={2}
                      placeholder="Reason for rejection..."
                      value={panelRejectReason}
                      onChange={(e) => setPanelRejectReason(e.target.value)}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <div className="flex gap-3">
                      <Button
                        className="flex-1"
                        variant="danger"
                        disabled={saving || !panelRejectReason.trim()}
                        onClick={() =>
                          setConfirmModal({
                            action: 'reject',
                            message: `Reject with reason: "${panelRejectReason.trim()}"?`,
                            onConfirm: rejectSelected,
                          })
                        }
                      >
                        Confirm Reject
                      </Button>
                      <Button
                        className="flex-1"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => {
                          setPanelRejectMode(false);
                          setPanelRejectReason('');
                          setPanelError('');
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
        </>,
        document.body,
      )}

      <AnimatePresence>
        {confirmModal && (
          <AnimatedModal
            maxWidth="max-w-sm"
            zIndexClass="z-[60]"
            onBackdropClick={saving ? undefined : () => setConfirmModal(null)}
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">
                {confirmModal.action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">{confirmModal.message}</p>
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                className="flex-1"
                variant={confirmModal.action === 'approve' ? 'success' : 'danger'}
                disabled={saving}
                onClick={async () => {
                  setConfirmModal(null);
                  await confirmModal.onConfirm();
                }}
              >
                {saving ? 'Processing...' : confirmModal.action === 'approve' ? 'Approve' : 'Reject'}
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={saving}
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </Button>
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>
    </>
  );
}
