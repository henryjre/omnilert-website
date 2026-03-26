import { type ElementType, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { api } from '@/shared/services/api.client';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useAuthStore } from '@/features/auth/store/authSlice';
import {
  AlertTriangle,
  Building2,
  Check,
  Clock3,
  CreditCard,
  ExternalLink,
  GitBranch,
  IdCard,
  Key,
  Upload,
  User,
  X,
} from 'lucide-react';
import { PERMISSIONS } from '@omnilert/shared';
import { ProfilePictureModal } from './ProfilePictureModal';

/** Read-only label + value row used inside the Work Details grid. */
function WorkInfoRow({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={`space-y-0.5 ${className}`}>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm font-medium text-gray-800">{value ?? 'Not set'}</dd>
    </div>
  );
}

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

interface ProfileUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  mobile_number: string | null;
  legal_name: string | null;
  birthday: string | null;
  gender: string | null;
  address: string | null;
  sss_number: string | null;
  tin_number: string | null;
  pagibig_number: string | null;
  philhealth_number: string | null;
  marital_status: string | null;
  avatar_url: string | null;
  pin: string | null;
  valid_id_url: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  emergency_relationship: string | null;
  bank_account_number: string | null;
  bank_id: number | null;
  department_id: string | null;
  department_name: string | null;
  position_title: string | null;
  date_started: string | null;
  is_active: boolean;
}

interface ProfilePayload {
  user: ProfileUser;
  workInfo: {
    company: { id: string; name: string } | null;
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
    department_id: string | null;
    department_name: string | null;
    position_title: string | null;
    status: 'active' | 'resigned' | 'inactive';
    date_started: string | null;
    days_of_employment: number | null;
  };
  personalVerification: {
    status: 'none' | 'pending' | 'approved' | 'rejected';
    latest: {
      id: string;
      status: 'pending' | 'approved' | 'rejected';
      requested_changes?: Record<string, unknown> | string | null;
      created_at: string;
      reviewed_at: string | null;
      rejection_reason: string | null;
    } | null;
  };
  bankVerification: {
    status: 'none' | 'pending' | 'approved' | 'rejected';
    latest: {
      id: string;
      status: 'pending' | 'approved' | 'rejected';
      bank_id: number;
      account_number: string;
      created_at: string;
      reviewed_at: string | null;
      rejection_reason: string | null;
    } | null;
  };
  bankCooldown: {
    cooldownActive: boolean;
    nextAllowedAt: string | null;
  };
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

const BANK_OPTIONS = [
  { label: 'BDO', value: 4 },
  { label: 'BPI', value: 5 },
  { label: 'Gcash', value: 3 },
  { label: 'Maya', value: 6 },
  { label: 'Metrobank', value: 2 },
] as const;

const GENDER_OPTIONS = [
  { value: '', label: 'Select gender' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const MARITAL_STATUS_OPTIONS = [
  { value: '', label: 'Select marital status' },
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'cohabitant', label: 'Legal Cohabitant' },
  { value: 'widower', label: 'Widower' },
  { value: 'divorced', label: 'Divorced' },
];

const VALID_MARITAL_STATUS_VALUES = new Set(
  MARITAL_STATUS_OPTIONS
    .map((option) => option.value)
    .filter((value) => value.length > 0),
);

function normalizeMaritalStatusValue(value: unknown): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'widowed') return 'widower';
  if (normalized === 'legal cohabitant') return 'cohabitant';
  return VALID_MARITAL_STATUS_VALUES.has(normalized) ? normalized : '';
}

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

function toDateInput(value: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseRequestedChanges(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function normalizeProfileCompareValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  if (key === 'email' || key === 'gender' || key === 'maritalStatus') {
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

function shouldApplyRequestedValue(key: string, requestedValue: unknown, currentValue: unknown): boolean {
  const requested = normalizeProfileCompareValue(key, requestedValue);
  if (!requested) return false;
  const current = normalizeProfileCompareValue(key, currentValue);
  return requested !== current;
}

/** localStorage keys for persisting unsaved form drafts. */
const PERSONAL_DRAFT_KEY = 'omnilert:profile:personal-draft';
const BANK_DRAFT_KEY = 'omnilert:profile:bank-draft';

type PersonalDraft = {
  firstName: string;
  lastName: string;
  mobileNumber: string;
  legalName: string;
  birthday: string;
  gender: string;
  address: string;
  sssNumber: string;
  tinNumber: string;
  pagibigNumber: string;
  philhealthNumber: string;
  maritalStatus: string;
  emergencyContact: string;
  emergencyPhone: string;
  emergencyRelationship: string;
};

type BankDraft = {
  bankId: string;
  bankAccountNumber: string;
};

function normalizeDraftString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function buildPersonalDraft(input: Partial<Record<keyof PersonalDraft, unknown>>): PersonalDraft {
  return {
    firstName: normalizeDraftString(input.firstName).trim(),
    lastName: normalizeDraftString(input.lastName).trim(),
    mobileNumber: normalizeDraftString(input.mobileNumber).trim(),
    legalName: normalizeDraftString(input.legalName).trim(),
    birthday: normalizeDraftString(input.birthday).trim(),
    gender: normalizeDraftString(input.gender).trim(),
    address: normalizeDraftString(input.address).trim(),
    sssNumber: normalizeDraftString(input.sssNumber).trim(),
    tinNumber: normalizeDraftString(input.tinNumber).trim(),
    pagibigNumber: normalizeDraftString(input.pagibigNumber).trim(),
    philhealthNumber: normalizeDraftString(input.philhealthNumber).trim(),
    maritalStatus: normalizeDraftString(input.maritalStatus).trim(),
    emergencyContact: normalizeDraftString(input.emergencyContact).trim(),
    emergencyPhone: normalizeDraftString(input.emergencyPhone).trim(),
    emergencyRelationship: normalizeDraftString(input.emergencyRelationship).trim(),
  };
}

function buildBankDraft(input: Partial<Record<keyof BankDraft, unknown>>): BankDraft {
  return {
    bankId: normalizeDraftString(input.bankId).trim(),
    bankAccountNumber: normalizeDraftString(input.bankAccountNumber).trim(),
  };
}

function arePersonalDraftsEqual(a: PersonalDraft, b: PersonalDraft): boolean {
  return (
    a.firstName === b.firstName
    && a.lastName === b.lastName
    && a.mobileNumber === b.mobileNumber
    && a.legalName === b.legalName
    && a.birthday === b.birthday
    && a.gender === b.gender
    && a.address === b.address
    && a.sssNumber === b.sssNumber
    && a.tinNumber === b.tinNumber
    && a.pagibigNumber === b.pagibigNumber
    && a.philhealthNumber === b.philhealthNumber
    && a.maritalStatus === b.maritalStatus
    && a.emergencyContact === b.emergencyContact
    && a.emergencyPhone === b.emergencyPhone
    && a.emergencyRelationship === b.emergencyRelationship
  );
}

function areBankDraftsEqual(a: BankDraft, b: BankDraft): boolean {
  return a.bankId === b.bankId && a.bankAccountNumber === b.bankAccountNumber;
}

export function EmploymentTab() {
  const updateUser = useAuthStore((s) => s.updateUser);
  const { hasPermission } = usePermission();
  const canSubmitEmployeeRequirements = hasPermission(PERMISSIONS.ACCOUNT_MANAGE_EMPLOYEE_REQUIREMENTS);

  const [loading, setLoading] = useState(true);
  const [submittingPersonal, setSubmittingPersonal] = useState(false);
  const [submittingBank, setSubmittingBank] = useState(false);
  const [submittingRequirement, setSubmittingRequirement] = useState(false);
  const [uploadingValidId, setUploadingValidId] = useState(false);
  const [fetchingPin, setFetchingPin] = useState(false);
  const [resettingPin, setResettingPin] = useState(false);
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();

  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [legalName, setLegalName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [sssNumber, setSssNumber] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [pagibigNumber, setPagibigNumber] = useState('');
  const [philhealthNumber, setPhilhealthNumber] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [pin, setPin] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [validIdUrl, setValidIdUrl] = useState<string | null>(null);

  const [emergencyContact, setEmergencyContact] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');

  const [bankId, setBankId] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');

  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [personalDraftRestored, setPersonalDraftRestored] = useState(false);
  const [bankDraftRestored, setBankDraftRestored] = useState(false);
  /** Prevents the "draft restored" banner from re-appearing on subsequent fetchProfile calls. */
  const isFirstProfileLoad = useRef(true);
  const personalBaselineRef = useRef<PersonalDraft | null>(null);
  const bankBaselineRef = useRef<BankDraft | null>(null);
  const validIdInputRef = useRef<HTMLInputElement>(null);

  const [selectedRequirement, setSelectedRequirement] = useState<RequirementItem | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; title: string } | null>(null);

  const personalPending = profile?.personalVerification.status === 'pending';
  const bankPending = profile?.bankVerification.status === 'pending';

  const fetchProfile = async () => {
    const res = await api.get('/account/profile');
    const payload = (res.data.data || null) as ProfilePayload | null;
    setProfile(payload);
    if (!payload) return;

    const isPersonalPending = payload.personalVerification.status === 'pending';
    const requestedChanges = parseRequestedChanges(payload.personalVerification.latest?.requested_changes);
    const isBankPending = payload.bankVerification.status === 'pending';

    setFirstName(
      isPersonalPending && shouldApplyRequestedValue('firstName', requestedChanges.firstName, payload.user.first_name)
        ? String(requestedChanges.firstName ?? '')
        : (payload.user.first_name || ''),
    );
    setLastName(
      isPersonalPending && shouldApplyRequestedValue('lastName', requestedChanges.lastName, payload.user.last_name)
        ? String(requestedChanges.lastName ?? '')
        : (payload.user.last_name || ''),
    );
    setMobileNumber(
      isPersonalPending
      && shouldApplyRequestedValue('mobileNumber', requestedChanges.mobileNumber, payload.user.mobile_number)
        ? String(requestedChanges.mobileNumber ?? '')
        : (payload.user.mobile_number || ''),
    );
    setLegalName(
      isPersonalPending && shouldApplyRequestedValue('legalName', requestedChanges.legalName, payload.user.legal_name)
        ? String(requestedChanges.legalName ?? '')
        : (payload.user.legal_name || ''),
    );
    setBirthday(
      isPersonalPending && shouldApplyRequestedValue('birthday', requestedChanges.birthday, payload.user.birthday)
        ? toDateInput((requestedChanges.birthday as string | null) ?? null)
        : toDateInput(payload.user.birthday),
    );
    setGender(
      isPersonalPending && shouldApplyRequestedValue('gender', requestedChanges.gender, payload.user.gender)
        ? String(requestedChanges.gender ?? '')
        : (payload.user.gender || ''),
    );
    setAddress(
      isPersonalPending && shouldApplyRequestedValue('address', requestedChanges.address, payload.user.address)
        ? String(requestedChanges.address ?? '')
        : (payload.user.address || ''),
    );
    setSssNumber(
      isPersonalPending && shouldApplyRequestedValue('sssNumber', requestedChanges.sssNumber, payload.user.sss_number)
        ? String(requestedChanges.sssNumber ?? '')
        : (payload.user.sss_number || ''),
    );
    setTinNumber(
      isPersonalPending && shouldApplyRequestedValue('tinNumber', requestedChanges.tinNumber, payload.user.tin_number)
        ? String(requestedChanges.tinNumber ?? '')
        : (payload.user.tin_number || ''),
    );
    setPagibigNumber(
      isPersonalPending
      && shouldApplyRequestedValue('pagibigNumber', requestedChanges.pagibigNumber, payload.user.pagibig_number)
        ? String(requestedChanges.pagibigNumber ?? '')
        : (payload.user.pagibig_number || ''),
    );
    setPhilhealthNumber(
      isPersonalPending
      && shouldApplyRequestedValue('philhealthNumber', requestedChanges.philhealthNumber, payload.user.philhealth_number)
        ? String(requestedChanges.philhealthNumber ?? '')
        : (payload.user.philhealth_number || ''),
    );
    setMaritalStatus(
      isPersonalPending
      && shouldApplyRequestedValue('maritalStatus', requestedChanges.maritalStatus, payload.user.marital_status)
        ? normalizeMaritalStatusValue(requestedChanges.maritalStatus)
        : normalizeMaritalStatusValue(payload.user.marital_status),
    );
    setPin(payload.user.pin || '');
    setAvatarUrl(payload.user.avatar_url || null);
    setValidIdUrl(payload.user.valid_id_url || null);
    setEmergencyContact(
      isPersonalPending
      && shouldApplyRequestedValue('emergencyContact', requestedChanges.emergencyContact, payload.user.emergency_contact)
        ? String(requestedChanges.emergencyContact ?? '')
        : (payload.user.emergency_contact || ''),
    );
    setEmergencyPhone(
      isPersonalPending
      && shouldApplyRequestedValue('emergencyPhone', requestedChanges.emergencyPhone, payload.user.emergency_phone)
        ? String(requestedChanges.emergencyPhone ?? '')
        : (payload.user.emergency_phone || ''),
    );
    setEmergencyRelationship(
      isPersonalPending
      && shouldApplyRequestedValue(
        'emergencyRelationship',
        requestedChanges.emergencyRelationship,
        payload.user.emergency_relationship,
      )
        ? String(requestedChanges.emergencyRelationship ?? '')
        : (payload.user.emergency_relationship || ''),
    );
    setBankId(
      isBankPending
        ? (payload.bankVerification.latest?.bank_id ? String(payload.bankVerification.latest.bank_id) : '')
        : (payload.user.bank_id ? String(payload.user.bank_id) : ''),
    );
    setBankAccountNumber(
      isBankPending
        ? String(payload.bankVerification.latest?.account_number ?? '')
        : (payload.user.bank_account_number || ''),
    );

    // Capture baseline values after applying server + pending-change overlay.
    const nextPersonalBaseline = buildPersonalDraft({
      firstName: (
        isPersonalPending && shouldApplyRequestedValue('firstName', requestedChanges.firstName, payload.user.first_name)
          ? String(requestedChanges.firstName ?? '')
          : (payload.user.first_name || '')
      ),
      lastName: (
        isPersonalPending && shouldApplyRequestedValue('lastName', requestedChanges.lastName, payload.user.last_name)
          ? String(requestedChanges.lastName ?? '')
          : (payload.user.last_name || '')
      ),
      mobileNumber: (
        isPersonalPending
        && shouldApplyRequestedValue('mobileNumber', requestedChanges.mobileNumber, payload.user.mobile_number)
          ? String(requestedChanges.mobileNumber ?? '')
          : (payload.user.mobile_number || '')
      ),
      legalName: (
        isPersonalPending && shouldApplyRequestedValue('legalName', requestedChanges.legalName, payload.user.legal_name)
          ? String(requestedChanges.legalName ?? '')
          : (payload.user.legal_name || '')
      ),
      birthday: (
        isPersonalPending && shouldApplyRequestedValue('birthday', requestedChanges.birthday, payload.user.birthday)
          ? toDateInput((requestedChanges.birthday as string | null) ?? null)
          : toDateInput(payload.user.birthday)
      ),
      gender: (
        isPersonalPending && shouldApplyRequestedValue('gender', requestedChanges.gender, payload.user.gender)
          ? String(requestedChanges.gender ?? '')
          : (payload.user.gender || '')
      ),
      address: (
        isPersonalPending && shouldApplyRequestedValue('address', requestedChanges.address, payload.user.address)
          ? String(requestedChanges.address ?? '')
          : (payload.user.address || '')
      ),
      sssNumber: (
        isPersonalPending && shouldApplyRequestedValue('sssNumber', requestedChanges.sssNumber, payload.user.sss_number)
          ? String(requestedChanges.sssNumber ?? '')
          : (payload.user.sss_number || '')
      ),
      tinNumber: (
        isPersonalPending && shouldApplyRequestedValue('tinNumber', requestedChanges.tinNumber, payload.user.tin_number)
          ? String(requestedChanges.tinNumber ?? '')
          : (payload.user.tin_number || '')
      ),
      pagibigNumber: (
        isPersonalPending
        && shouldApplyRequestedValue('pagibigNumber', requestedChanges.pagibigNumber, payload.user.pagibig_number)
          ? String(requestedChanges.pagibigNumber ?? '')
          : (payload.user.pagibig_number || '')
      ),
      philhealthNumber: (
        isPersonalPending
        && shouldApplyRequestedValue('philhealthNumber', requestedChanges.philhealthNumber, payload.user.philhealth_number)
          ? String(requestedChanges.philhealthNumber ?? '')
          : (payload.user.philhealth_number || '')
      ),
      maritalStatus: (
        isPersonalPending
        && shouldApplyRequestedValue('maritalStatus', requestedChanges.maritalStatus, payload.user.marital_status)
          ? normalizeMaritalStatusValue(requestedChanges.maritalStatus)
          : normalizeMaritalStatusValue(payload.user.marital_status)
      ),
      emergencyContact: (
        isPersonalPending
        && shouldApplyRequestedValue('emergencyContact', requestedChanges.emergencyContact, payload.user.emergency_contact)
          ? String(requestedChanges.emergencyContact ?? '')
          : (payload.user.emergency_contact || '')
      ),
      emergencyPhone: (
        isPersonalPending
        && shouldApplyRequestedValue('emergencyPhone', requestedChanges.emergencyPhone, payload.user.emergency_phone)
          ? String(requestedChanges.emergencyPhone ?? '')
          : (payload.user.emergency_phone || '')
      ),
      emergencyRelationship: (
        isPersonalPending
        && shouldApplyRequestedValue(
          'emergencyRelationship',
          requestedChanges.emergencyRelationship,
          payload.user.emergency_relationship,
        )
          ? String(requestedChanges.emergencyRelationship ?? '')
          : (payload.user.emergency_relationship || '')
      ),
    });

    const nextBankBaseline = buildBankDraft({
      bankId: (
        isBankPending
          ? (payload.bankVerification.latest?.bank_id ? String(payload.bankVerification.latest.bank_id) : '')
          : (payload.user.bank_id ? String(payload.user.bank_id) : '')
      ),
      bankAccountNumber: (
        isBankPending
          ? String(payload.bankVerification.latest?.account_number ?? '')
          : (payload.user.bank_account_number || '')
      ),
    });

    personalBaselineRef.current = nextPersonalBaseline;
    bankBaselineRef.current = nextBankBaseline;

    // ── Restore localStorage drafts (only on first load, only when not locked) ──
    if (isFirstProfileLoad.current) {
      isFirstProfileLoad.current = false;

      if (!isPersonalPending) {
        try {
          const raw = localStorage.getItem(PERSONAL_DRAFT_KEY);
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            const draft = buildPersonalDraft((parsed && typeof parsed === 'object') ? (parsed as Partial<Record<keyof PersonalDraft, unknown>>) : {});
            const baseline = personalBaselineRef.current;

            // If draft equals current baseline, it isn't an "unsaved change" — clear it silently.
            if (baseline && arePersonalDraftsEqual(draft, baseline)) {
              localStorage.removeItem(PERSONAL_DRAFT_KEY);
              setPersonalDraftRestored(false);
            } else {
              setFirstName(draft.firstName);
              setLastName(draft.lastName);
              setMobileNumber(draft.mobileNumber);
              setLegalName(draft.legalName);
              setBirthday(draft.birthday);
              setGender(draft.gender);
              setAddress(draft.address);
              setSssNumber(draft.sssNumber);
              setTinNumber(draft.tinNumber);
              setPagibigNumber(draft.pagibigNumber);
              setPhilhealthNumber(draft.philhealthNumber);
              setMaritalStatus(draft.maritalStatus);
              setEmergencyContact(draft.emergencyContact);
              setEmergencyPhone(draft.emergencyPhone);
              setEmergencyRelationship(draft.emergencyRelationship);
              setPersonalDraftRestored(true);
            }
          }
        } catch { /* ignore malformed draft */ }
      } else {
        localStorage.removeItem(PERSONAL_DRAFT_KEY);
      }

      if (!isBankPending) {
        try {
          const raw = localStorage.getItem(BANK_DRAFT_KEY);
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            const draft = buildBankDraft((parsed && typeof parsed === 'object') ? (parsed as Partial<Record<keyof BankDraft, unknown>>) : {});
            const baseline = bankBaselineRef.current;

            if (baseline && areBankDraftsEqual(draft, baseline)) {
              localStorage.removeItem(BANK_DRAFT_KEY);
              setBankDraftRestored(false);
            } else {
              setBankId(draft.bankId);
              setBankAccountNumber(draft.bankAccountNumber);
              setBankDraftRestored(true);
            }
          }
        } catch { /* ignore malformed draft */ }
      } else {
        localStorage.removeItem(BANK_DRAFT_KEY);
      }
    }
  };

  const fetchRequirements = async () => {
    if (!canSubmitEmployeeRequirements) {
      setRequirements([]);
      return;
    }
    const res = await api.get('/account/employment/requirements');
    setRequirements(res.data.data || []);
  };

  useEffect(() => {
    const requests: Array<Promise<unknown>> = [fetchProfile()];
    if (canSubmitEmployeeRequirements) {
      requests.push(fetchRequirements());
    } else {
      setRequirements([]);
      setSelectedRequirement(null);
    }

    Promise.all(requests)
      .catch((err: any) => {
        showErrorToast(err.response?.data?.error || 'Failed to load profile');
      })
      .finally(() => setLoading(false));
  }, [canSubmitEmployeeRequirements, showErrorToast]);

  /** Auto-save personal info draft to localStorage on every change (skipped while loading or pending). */
  useEffect(() => {
    if (loading || personalPending) return;
    try {
      const baseline = personalBaselineRef.current;
      const draft = buildPersonalDraft({
        firstName, lastName, mobileNumber, legalName, birthday, gender,
        address, sssNumber, tinNumber, pagibigNumber, philhealthNumber,
        maritalStatus, emergencyContact, emergencyPhone, emergencyRelationship,
      });

      // If form matches baseline, there is no "unsaved change" to persist.
      if (baseline && arePersonalDraftsEqual(draft, baseline)) {
        localStorage.removeItem(PERSONAL_DRAFT_KEY);
        return;
      }

      localStorage.setItem(PERSONAL_DRAFT_KEY, JSON.stringify(draft));
    } catch { /* ignore storage quota errors */ }
  }, [
    firstName, lastName, mobileNumber, legalName, birthday, gender,
    address, sssNumber, tinNumber, pagibigNumber, philhealthNumber,
    maritalStatus, emergencyContact, emergencyPhone, emergencyRelationship,
    loading, personalPending,
  ]);

  /** Auto-save bank info draft to localStorage on every change. */
  useEffect(() => {
    if (loading || bankPending) return;
    try {
      const baseline = bankBaselineRef.current;
      const draft = buildBankDraft({ bankId, bankAccountNumber });
      if (baseline && areBankDraftsEqual(draft, baseline)) {
        localStorage.removeItem(BANK_DRAFT_KEY);
        return;
      }
      localStorage.setItem(BANK_DRAFT_KEY, JSON.stringify(draft));
    } catch { /* ignore */ }
  }, [bankId, bankAccountNumber, loading, bankPending]);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 10) value = value.slice(0, 10);
    if (!value.startsWith('63') && value.length > 0) {
      value = `63${value}`;
    }
    setMobileNumber(value);
  };

  const handleGetPin = async () => {
    setFetchingPin(true);
    try {
      const res = await api.post('/users/me/pin', {});
      setPin(res.data.data.pin || '');
      showSuccessToast('PIN code retrieved successfully.');
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to get PIN code');
    } finally {
      setFetchingPin(false);
    }
  };

  const handleResetPin = async () => {
    setResettingPin(true);
    try {
      const res = await api.post('/users/me/pin/reset', {});
      setPin(res.data.data.pin || '');
      showSuccessToast('PIN code reset successfully.');
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to reset PIN code');
    } finally {
      setResettingPin(false);
    }
  };

  const handleUploadValidId = async (file: File) => {
    if (!true) {
      showErrorToast('You do not have permission to edit your profile.');
      return;
    }
    setUploadingValidId(true);
    try {
      const formData = new FormData();
      formData.append('document', file);
      const res = await api.post('/account/valid-id', formData);
      const nextValidIdUrl = res.data.data.validIdUrl || null;
      setValidIdUrl(nextValidIdUrl);
      setProfile((prev) => (prev
        ? {
          ...prev,
          user: {
            ...prev.user,
            valid_id_url: nextValidIdUrl,
          },
        }
        : prev));
      if (canSubmitEmployeeRequirements) {
        await fetchRequirements();
      }
      showSuccessToast('Valid ID uploaded successfully.');
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to upload valid ID');
    } finally {
      setUploadingValidId(false);
    }
  };

  const handleSubmitPersonalVerification = async () => {
    if (!true) {
      showErrorToast('You do not have permission to edit your profile.');
      return;
    }
    setSubmittingPersonal(true);
    try {
      await api.post('/account/personal-information/verifications', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobileNumber: mobileNumber.trim(),
        legalName: legalName.trim(),
        birthday: birthday || null,
        gender: gender || null,
        address: address.trim(),
        sssNumber: sssNumber.trim(),
        tinNumber: tinNumber.trim(),
        pagibigNumber: pagibigNumber.trim(),
        philhealthNumber: philhealthNumber.trim(),
        maritalStatus: maritalStatus.trim(),
        emergencyContact: emergencyContact.trim(),
        emergencyPhone: emergencyPhone.trim(),
        emergencyRelationship: emergencyRelationship.trim(),
      });
      localStorage.removeItem(PERSONAL_DRAFT_KEY);
      setPersonalDraftRestored(false);
      await fetchProfile();
      showSuccessToast('Personal information submitted for verification.');
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to submit personal information verification');
    } finally {
      setSubmittingPersonal(false);
    }
  };

  const handleSubmitBankVerification = async () => {
    if (!true) {
      showErrorToast('You do not have permission to edit your profile.');
      return;
    }
    if (!bankId || !bankAccountNumber.trim()) {
      showErrorToast('Bank and account number are required.');
      return;
    }

    setSubmittingBank(true);
    try {
      await api.post('/account/bank-information/verifications', {
        bankId: Number(bankId),
        accountNumber: bankAccountNumber.trim(),
      });
      localStorage.removeItem(BANK_DRAFT_KEY);
      setBankDraftRestored(false);
      await fetchProfile();
      showSuccessToast('Bank information submitted for verification.');
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to submit bank information verification');
    } finally {
      setSubmittingBank(false);
    }
  };

  const closeRequirementModal = () => {
    setSelectedRequirement(null);
    setSelectedFile(null);
  };

  const submitRequirement = async () => {
    if (!true) {
      showErrorToast('You do not have permission to edit your profile.');
      return;
    }
    if (!selectedRequirement) return;
    if (!canSubmitEmployeeRequirements) return;

    const canUseExistingGovId =
      selectedRequirement.code === 'government_issued_id' && !!selectedRequirement.document_url;

    if (!selectedFile && !canUseExistingGovId) {
      showErrorToast('Select a file before submitting this requirement.');
      return;
    }

    setSubmittingRequirement(true);
    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('document', selectedFile);
      }

      await api.post(
        `/account/employment/requirements/${selectedRequirement.code}/submit`,
        formData,
      );
      showSuccessToast(`${selectedRequirement.label} submitted for verification.`);
      closeRequirementModal();
      await fetchRequirements();
      await fetchProfile();
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to submit requirement');
    } finally {
      setSubmittingRequirement(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6">

      {/* ─── Page header ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3">
          <IdCard className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        </div>
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Your employment record, personal details, and bank information.
        </p>
      </div>

      {/* ─── Employee summary (read-only snapshot) ───────────────────── */}
      <Card>
        <CardBody className="p-4 sm:p-5">
          {/* Mobile: centered column; Desktop: side-by-side row */}
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
            {/* Avatar + change picture link (grouped together) */}
            <div className="flex shrink-0 flex-col items-center gap-1.5 sm:items-center">
              <div className="relative h-24 w-24 sm:h-20 sm:w-20">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-primary-100">
                    <span className="text-3xl font-bold text-primary-600 sm:text-2xl">
                      {firstName?.[0] || lastName?.[0] || '?'}
                    </span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                disabled={!true}
                className="text-xs text-primary-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
              >
                Change Picture
              </button>
            </div>

            {/* Name + quick info */}
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-2">
                <div>
                  <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                    {`${firstName} ${lastName}`.trim() || 'Unnamed User'}
                  </h2>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {profile?.workInfo.position_title || 'No position set'}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    profile?.workInfo.status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : profile?.workInfo.status === 'resigned'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {profile?.workInfo.status === 'resigned'
                    ? 'Resigned'
                    : profile?.workInfo.status === 'inactive'
                      ? 'Inactive'
                      : 'Active'}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-gray-400 sm:justify-start">
                {profile?.workInfo.company && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {profile.workInfo.company.name}
                  </span>
                )}
                {profile?.workInfo.resident_branch && (
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {profile.workInfo.resident_branch.branch_name}
                  </span>
                )}
                {profile?.workInfo.days_of_employment !== null &&
                  profile?.workInfo.days_of_employment !== undefined && (
                  <span className="flex items-center gap-1">
                    <Clock3 className="h-3 w-3" />
                    {profile.workInfo.days_of_employment} days employed
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Work details grid */}
          {profile && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Work Details
              </p>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <WorkInfoRow label="Department" value={profile.workInfo.department_name} />
                <WorkInfoRow label="Date Started" value={profile.workInfo.date_started} />
                {!profile.workInfo.resident_branch && profile.workInfo.home_resident_branch && (
                  <WorkInfoRow
                    label="Home Branch"
                    value={`${profile.workInfo.home_resident_branch.branch_name} (${profile.workInfo.home_resident_branch.company_name})`}
                    className="sm:col-span-2"
                  />
                )}
                {profile.workInfo.borrow_branches.length > 0 && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <dt className="text-xs text-gray-400">Borrow Branches</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {profile.workInfo.borrow_branches.map((b) => (
                        <span
                          key={b.branch_id}
                          className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700"
                        >
                          {b.branch_name}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* POS PIN */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="mb-3 flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                POS PIN Code
              </p>
            </div>
            <div className="flex gap-2 sm:max-w-xs">
              <Input
                type="text"
                value={pin}
                readOnly
                placeholder="No PIN yet"
                className="flex-1 bg-gray-50 font-mono tracking-widest"
              />
              {pin ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleResetPin}
                  disabled={fetchingPin || resettingPin}
                >
                  {resettingPin ? 'Resetting...' : 'Reset PIN'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleGetPin}
                  disabled={fetchingPin}
                >
                  {fetchingPin ? 'Getting...' : 'Get PIN'}
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ─── Personal information (editable) ─────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Personal Information</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Fill in your personal, contact, and emergency details. All changes go through verification before taking effect.
          </p>
        </CardHeader>
        <CardBody className="space-y-6">

          {/* Draft restored banner */}
          {personalDraftRestored && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
              <p className="text-xs text-blue-700">
                Your unsaved changes from a previous session were restored.
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(PERSONAL_DRAFT_KEY);
                    setPersonalDraftRestored(false);
                    void fetchProfile();
                  }}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setPersonalDraftRestored(false)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Verification status banners */}
          {personalPending && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">Verification in Progress</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Your submitted details are under review. Fields are locked until a decision is made.
                </p>
              </div>
            </div>
          )}
          {profile?.personalVerification.status === 'rejected' &&
            profile.personalVerification.latest?.rejection_reason && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">Verification Rejected</p>
                <p className="mt-0.5 text-xs text-red-700">
                  {profile.personalVerification.latest.rejection_reason}
                </p>
              </div>
            </div>
          )}
          {!true && (
            <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <p className="text-xs text-gray-500">
                You can view your profile, but do not have permission to submit updates.
              </p>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Changes are sent for verification first. Your profile and Odoo records update only after approval.
          </p>

          {/* Basic details */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700">Basic Details</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">First Name</label>
                <Input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter first name"
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Last Name</label>
                <Input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter last name"
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Legal Name</label>
                <Input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Enter your full legal name as it appears on your ID"
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Birthday</label>
                <Input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  disabled={personalPending}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50"
                >
                  {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Marital Status</label>
                <select
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                  disabled={personalPending}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50"
                >
                  {MARITAL_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <h4 className="text-sm font-semibold text-gray-700">Contact</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Home Address</label>
                <Input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Enter your home address"
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Mobile Number</label>
                <div className="flex rounded-md shadow-sm">
                  <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                    +63
                  </span>
                  <Input
                    type="text"
                    value={mobileNumber.replace(/^63/, '')}
                    onChange={handleMobileChange}
                    placeholder="9123456789"
                    className="rounded-l-none"
                    disabled={personalPending}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Government IDs */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <h4 className="text-sm font-semibold text-gray-700">Government IDs &amp; Contributions</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">SSS Number</label>
                <Input
                  type="text"
                  value={sssNumber}
                  onChange={(e) => setSssNumber(e.target.value)}
                  placeholder="Enter SSS number"
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">TIN Number</label>
                <Input
                  type="text"
                  value={tinNumber}
                  onChange={(e) => setTinNumber(e.target.value)}
                  placeholder="Enter TIN number"
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Pag-IBIG Number</label>
                <Input
                  type="text"
                  value={pagibigNumber}
                  onChange={(e) => setPagibigNumber(e.target.value)}
                  placeholder="Enter Pag-IBIG number"
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">PhilHealth Number</label>
                <Input
                  type="text"
                  value={philhealthNumber}
                  onChange={(e) => setPhilhealthNumber(e.target.value)}
                  placeholder="Enter PhilHealth number"
                  disabled={personalPending}
                />
              </div>
            </div>
          </div>

          {/* Emergency contact */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <h4 className="text-sm font-semibold text-gray-700">Emergency Contact</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Contact Name</label>
                <Input
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="Enter emergency contact name"
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Contact Number</label>
                <Input
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  placeholder="Enter emergency contact number"
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Relationship</label>
                <Input
                  value={emergencyRelationship}
                  onChange={(e) => setEmergencyRelationship(e.target.value)}
                  placeholder="E.g. Mother, Spouse, Sibling"
                  disabled={personalPending}
                />
              </div>
            </div>
          </div>

          {/* Valid ID */}
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700">Valid ID</h4>
              <p className="mt-0.5 text-xs text-gray-400">
                Required for personal information verification. Upload a photo or scanned copy.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {validIdUrl ? (
                <a
                  href={validIdUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                >
                  View current valid ID <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <span className="text-sm text-gray-400">No valid ID uploaded yet.</span>
              )}
              <input
                ref={validIdInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (file) handleUploadValidId(await normalizeFileForUpload(file));
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => validIdInputRef.current?.click()}
                disabled={uploadingValidId || !true}
              >
                <Upload className="mr-1 h-4 w-4" />
                {uploadingValidId ? 'Uploading...' : validIdUrl ? 'Replace' : 'Upload Valid ID'}
              </Button>
            </div>
          </div>

          {/* Submit personal */}
          <div className="flex flex-col items-end gap-1 border-t border-gray-100 pt-4">
            <Button
              type="button"
              variant="success"
              disabled={!true || Boolean(personalPending) || submittingPersonal}
              onClick={handleSubmitPersonalVerification}
            >
              {submittingPersonal ? 'Submitting...' : 'Submit for Verification'}
            </Button>
            {personalPending && (
              <p className="text-xs text-amber-700">Pending verification — fields are locked.</p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ─── Bank information (editable) ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Bank Information</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Your salary disbursement account. All changes go through verification.
          </p>
        </CardHeader>
        <CardBody className="space-y-6">

          {/* Draft restored banner */}
          {bankDraftRestored && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
              <p className="text-xs text-blue-700">
                Your unsaved bank details from a previous session were restored.
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(BANK_DRAFT_KEY);
                    setBankDraftRestored(false);
                    void fetchProfile();
                  }}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setBankDraftRestored(false)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Verification status banners */}
          {bankPending && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">Verification in Progress</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Your bank details are under review. Fields are locked until a decision is made.
                </p>
              </div>
            </div>
          )}
          {profile?.bankVerification.status === 'rejected' &&
            profile.bankVerification.latest?.rejection_reason && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-800">Verification Rejected</p>
                <p className="mt-0.5 text-xs text-red-700">
                  {profile.bankVerification.latest.rejection_reason}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Bank</label>
              <select
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
                disabled={bankPending}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50"
              >
                <option value="">Select bank</option>
                {BANK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Account Number</label>
              <Input
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="Enter account number"
                disabled={bankPending}
              />
            </div>
          </div>

          {profile?.bankCooldown.cooldownActive && profile.bankCooldown.nextAllowedAt && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-700">
                Bank information can be resubmitted after{' '}
                {new Date(profile.bankCooldown.nextAllowedAt).toLocaleString()}.
              </p>
            </div>
          )}

          <div className="flex flex-col items-end gap-1 border-t border-gray-100 pt-4">
            <Button
              type="button"
              variant="success"
              disabled={
                !true
                || Boolean(bankPending)
                || Boolean(profile?.bankCooldown.cooldownActive)
                || submittingBank
              }
              onClick={handleSubmitBankVerification}
            >
              {submittingBank ? 'Submitting...' : 'Submit for Verification'}
            </Button>
            {bankPending && (
              <p className="text-xs text-amber-700">Pending verification — fields are locked.</p>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ─── Employment requirements ──────────────────────────────────── */}
      {canSubmitEmployeeRequirements && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Employment Requirements</h2>
            <p className="mt-1 text-sm text-gray-500">
              Upload your documents per requirement. Each submission is reviewed before completion.
            </p>
          </CardHeader>
          <CardBody>
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
                    className="min-h-[160px] rounded-xl border border-gray-200 p-3 text-left transition hover:border-primary-300 hover:shadow-sm"
                  >
                    <div className="flex h-full flex-col justify-between">
                      <div className="space-y-2">
                        <div className={`inline-flex rounded-full p-1.5 ${status.iconClass}`}>
                          <status.Icon className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-[13px] font-medium leading-snug text-gray-900">
                          {requirement.label}
                        </p>
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
      )}

      {/* ─── Requirement upload modal ─────────────────────────────────── */}
      <AnimatePresence>
        {canSubmitEmployeeRequirements && selectedRequirement && (
          <AnimatedModal onBackdropClick={closeRequirementModal} maxWidth="max-w-lg">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="font-semibold text-gray-900">{selectedRequirement.label}</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Status:{' '}
                  <span className={`font-medium ${
                    selectedRequirement.display_status === 'complete'
                      ? 'text-green-600'
                      : selectedRequirement.display_status === 'rejected'
                        ? 'text-red-600'
                        : selectedRequirement.display_status === 'verification'
                          ? 'text-blue-600'
                          : 'text-amber-600'
                  }`}>
                    {STATUS_CONFIG[selectedRequirement.display_status].label}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeRequirementModal}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 px-5 py-4">
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
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                  This requirement is already pending verification.
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Upload image or PDF
                  </label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      setSelectedFile(file ? await normalizeFileForUpload(file) : null);
                    }}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
                  />
                  <p className="text-xs text-gray-400">
                    Accepted formats: all image types and PDF (max 10 MB).
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <Button
                variant="secondary"
                onClick={closeRequirementModal}
                disabled={submittingRequirement}
              >
                Close
              </Button>
              {selectedRequirement.display_status !== 'verification' && (
                <Button
                  variant="success"
                  onClick={submitRequirement}
                  disabled={!true || submittingRequirement}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  {submittingRequirement ? 'Submitting...' : 'Submit for Verification'}
                </Button>
              )}
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>

      {/* ─── Document preview modal ───────────────────────────────────── */}
      <AnimatePresence>
        {previewDoc && (
          <AnimatedModal onBackdropClick={() => setPreviewDoc(null)} maxWidth="max-w-4xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{previewDoc.title}</p>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
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
          </AnimatedModal>
        )}
      </AnimatePresence>

      <ProfilePictureModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onUploadComplete={(url) => {
          setAvatarUrl(url);
          updateUser({ avatarUrl: url });
          showSuccessToast('Profile picture updated successfully.');
          void fetchProfile();
        }}
      />
    </div>
  );
}
