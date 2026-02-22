import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { PERMISSIONS } from '@omnilert/shared';
import { CheckCircle, ClipboardCheck, ExternalLink, IdCard, Landmark, UserRoundPlus, Users, X, XCircle } from 'lucide-react';

type VerificationStatus = 'pending' | 'approved' | 'rejected';
type VerificationType = 'registration' | 'personalInformation' | 'employmentRequirements' | 'bankInformation';

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

const STATUS_VARIANT: Record<VerificationStatus, string> = {
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
};

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

function TypeCard({
  type,
  item,
  onClick,
}: {
  type: VerificationType;
  item: any;
  onClick: () => void;
}) {
  return (
    <div
      className="cursor-pointer rounded-xl transition-shadow hover:shadow-md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div>
              {type === 'registration' && (
                <>
                  <p className="font-medium text-gray-900">
                    {item.first_name} {item.last_name}
                  </p>
                  <p className="text-sm text-gray-600">{item.email}</p>
                  <p className="text-xs text-gray-500">
                    Requested: {new Date(item.requested_at).toLocaleString()}
                  </p>
                </>
              )}
              {type === 'personalInformation' && (
                <>
                  <p className="font-medium text-gray-900">
                    {item.first_name} {item.last_name}
                  </p>
                  <p className="text-sm text-gray-600">{item.email}</p>
                  <p className="text-xs text-gray-500">
                    Submitted: {new Date(item.created_at).toLocaleString()}
                  </p>
                </>
              )}
              {type === 'employmentRequirements' && (
                <>
                  <p className="font-medium text-gray-900">
                    {item.first_name} {item.last_name}
                  </p>
                  <p className="text-sm text-gray-600">{item.requirement_label}</p>
                  <p className="text-xs text-gray-500">
                    Submitted: {new Date(item.created_at).toLocaleString()}
                  </p>
                </>
              )}
              {type === 'bankInformation' && (
                <>
                  <p className="font-medium text-gray-900">
                    {item.first_name} {item.last_name}
                  </p>
                  <p className="text-sm text-gray-600">
                    {BANK_LABEL[Number(item.bank_id)] ?? `Bank ID ${item.bank_id}`}
                  </p>
                  <p className="text-xs text-gray-500">Account: {item.account_number}</p>
                  <p className="text-xs text-gray-500">
                    Submitted: {new Date(item.created_at).toLocaleString()}
                  </p>
                </>
              )}
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                STATUS_VARIANT[item.status as VerificationStatus] ?? STATUS_VARIANT.pending
              }`}
            >
              {item.status}
            </span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export function EmployeeVerificationsPage() {
  const PAGE_SIZE = 10;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeType, setActiveType] = useState<VerificationType>('registration');
  const [statusFilter, setStatusFilter] = useState<'all' | VerificationStatus>('pending');
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

  const [approveRoleIds, setApproveRoleIds] = useState<string[]>([]);
  const [approveCompanyIds, setApproveCompanyIds] = useState<string[]>([]);
  const [approveBranchIdsByCompany, setApproveBranchIdsByCompany] = useState<Record<string, string[]>>({});
  const [approveResidentCompanyId, setApproveResidentCompanyId] = useState('');
  const [approveResidentBranchId, setApproveResidentBranchId] = useState('');
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
  const canApproveRegistration = hasPermission(PERMISSIONS.REGISTRATION_APPROVE);
  const canApprovePersonalInfo = hasPermission(PERMISSIONS.PERSONAL_INFORMATION_APPROVE);
  const canApproveRequirements = hasPermission(PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE);
  const canApproveBankInfo = hasPermission(PERMISSIONS.BANK_INFORMATION_APPROVE);

  const listByType = useMemo(() => {
    if (activeType === 'registration') return data.registration;
    if (activeType === 'personalInformation') return data.personalInformation;
    if (activeType === 'employmentRequirements') return data.employmentRequirements;
    return data.bankInformation;
  }, [activeType, data]);

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
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError('');
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
      setError(err.response?.data?.error || 'Failed to load employee verifications');
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, [canApproveRegistration]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(''), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);

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

    if (type === 'registration') {
      setApproveRoleIds([]);
      setApproveCompanyIds([]);
      setApproveBranchIdsByCompany({});
      setApproveResidentCompanyId('');
      setApproveResidentBranchId('');
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

  const approveSelected = async () => {
    if (!selectedItem) return;

    setPanelError('');
    setSuccess('');
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

        await api.post(`/employee-verifications/registration/${selectedItem.data.id}/approve`, {
          roleIds: approveRoleIds,
          companyAssignments,
          residentBranch: {
            companyId: approveResidentCompanyId,
            branchId: approveResidentBranchId,
          },
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

      setSuccess('Verification approved.');
      closePanel();
      await fetchData();
    } catch (err: any) {
      setPanelError(err.response?.data?.error || 'Failed to approve verification');
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
    setSuccess('');
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

      setSuccess('Verification rejected.');
      closePanel();
      await fetchData();
    } catch (err: any) {
      setPanelError(err.response?.data?.error || 'Failed to reject verification');
    } finally {
      setSaving(false);
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
        <div>
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Employee Verifications</h1>
            {pendingCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-gray-600 sm:hidden">{activeTypeLabel}</p>
        </div>

        <div className="mx-auto flex w-fit flex-wrap items-center justify-center gap-2 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:justify-start">
          {([
            { key: 'registration', label: 'Registration', icon: UserRoundPlus },
            { key: 'personalInformation', label: 'Personal Information', icon: IdCard },
            { key: 'employmentRequirements', label: 'Employment Requirements', icon: ClipboardCheck },
            { key: 'bankInformation', label: 'Bank Information', icon: Landmark },
          ] as Array<{ key: VerificationType; label: string; icon: React.ElementType }>).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveType(tab.key)}
              aria-label={tab.label}
              title={tab.label}
              className={`rounded-md px-4 py-2.5 text-sm font-medium transition-colors sm:px-4 sm:py-1.5 ${
                activeType === tab.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <tab.icon className="h-5 w-5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mx-auto flex w-full items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit sm:justify-start">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium capitalize transition-colors sm:flex-none ${
                statusFilter === status
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        {success && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>}

        <div className="space-y-3">
          {filtered.length === 0 && <p className="text-sm text-gray-500">No records in this filter.</p>}
          {pagedFiltered.map((item: any) => (
            <TypeCard
              key={item.id}
              type={activeType}
              item={item}
              onClick={() => openPanel(activeType, item)}
            />
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
      </div>

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
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <p className="font-semibold text-gray-900">
                  {selectedItem.type === 'registration'
                    ? 'Registration Verification'
                    : selectedItem.type === 'personalInformation'
                      ? 'Personal Information Verification'
                      : selectedItem.type === 'employmentRequirements'
                        ? 'Employment Requirement Verification'
                        : 'Bank Information Verification'}
                </p>
                <p className="text-xs text-gray-500">
                  {selectedItem.data.first_name} {selectedItem.data.last_name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    STATUS_VARIANT[selectedItem.data.status as VerificationStatus] ?? STATUS_VARIANT.pending
                  }`}
                >
                  {selectedItem.data.status}
                </span>
                <button
                  onClick={closePanel}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
              {selectedItem.type === 'registration' && (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <span className="text-gray-500">Email</span>
                    <span className="font-medium text-gray-900">{selectedItem.data.email}</span>
                    <span className="text-gray-500">Requested</span>
                    <span className="font-medium text-gray-900">
                      {new Date(selectedItem.data.requested_at).toLocaleString()}
                    </span>
                    {selectedItem.data.reviewed_at && (
                      <>
                        <span className="text-gray-500">Reviewed</span>
                        <span className="font-medium text-gray-900">
                          {new Date(selectedItem.data.reviewed_at).toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>

                  {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
                    <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                      <span className="font-medium">Rejection reason: </span>
                      {selectedItem.data.rejection_reason}
                    </div>
                  )}

                  {canActOnSelected && (
                    <>
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
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <span className="text-gray-500">Email</span>
                    <span className="font-medium text-gray-900">{selectedItem.data.email}</span>
                    <span className="text-gray-500">Submitted</span>
                    <span className="font-medium text-gray-900">
                      {new Date(selectedItem.data.created_at).toLocaleString()}
                    </span>
                  </div>

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

                  <div className="rounded-lg bg-slate-200 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Requested Changes
                    </p>
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
                          <p key={key}>
                            <span className="font-medium">{PERSONAL_FIELD_LABEL[key]}: </span>
                            <span className="line-through">{formatPersonalValue(key, original)}</span>
                            <span className="mx-2 text-gray-500">-&gt;</span>
                            <span className="font-semibold">{formatPersonalValue(key, next)}</span>
                          </p>
                        );
                      })}
                    </div>
                  </div>

                  {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
                    <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                      <span className="font-medium">Rejection reason: </span>
                      {selectedItem.data.rejection_reason}
                    </div>
                  )}

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
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <span className="text-gray-500">Requirement</span>
                    <span className="font-medium text-gray-900">
                      {selectedItem.data.requirement_label}
                    </span>
                    <span className="text-gray-500">Email</span>
                    <span className="font-medium text-gray-900">{selectedItem.data.email}</span>
                    <span className="text-gray-500">Submitted</span>
                    <span className="font-medium text-gray-900">
                      {new Date(selectedItem.data.created_at).toLocaleString()}
                    </span>
                  </div>

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
                    <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                      <span className="font-medium">Rejection reason: </span>
                      {selectedItem.data.rejection_reason}
                    </div>
                  )}
                </>
              )}

              {selectedItem.type === 'bankInformation' && (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <span className="text-gray-500">Email</span>
                    <span className="font-medium text-gray-900">{selectedItem.data.email}</span>
                    <span className="text-gray-500">Bank</span>
                    <span className="font-medium text-gray-900">
                      {BANK_LABEL[Number(selectedItem.data.bank_id)] ?? `Bank ID ${selectedItem.data.bank_id}`}
                    </span>
                    <span className="text-gray-500">Account Number</span>
                    <span className="font-medium text-gray-900">{selectedItem.data.account_number}</span>
                    <span className="text-gray-500">Submitted</span>
                    <span className="font-medium text-gray-900">
                      {new Date(selectedItem.data.created_at).toLocaleString()}
                    </span>
                    {selectedItem.data.reviewed_by_name && (
                      <>
                        <span className="text-gray-500">Reviewed By</span>
                        <span className="font-medium text-gray-900">
                          {selectedItem.data.reviewed_by_name}
                        </span>
                      </>
                    )}
                  </div>

                  {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
                    <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                      <span className="font-medium">Rejection reason: </span>
                      {selectedItem.data.rejection_reason}
                    </div>
                  )}
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

      {confirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
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
              <Button className="flex-1" variant="secondary" onClick={() => setConfirmModal(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
