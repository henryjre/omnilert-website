import { type ElementType, useEffect, useRef, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useAuthStore } from '@/features/auth/store/authSlice';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  IdCard,
  Key,
  Upload,
  X,
} from 'lucide-react';
import { ProfilePictureModal } from './ProfilePictureModal';

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

function shouldApplyRequestedValue(key: string, requestedValue: unknown, currentValue: unknown): boolean {
  const requested = normalizeProfileCompareValue(key, requestedValue);
  if (!requested) return false;
  const current = normalizeProfileCompareValue(key, currentValue);
  return requested !== current;
}

export function EmploymentTab() {
  const updateUser = useAuthStore((s) => s.updateUser);

  const [loading, setLoading] = useState(true);
  const [submittingPersonal, setSubmittingPersonal] = useState(false);
  const [submittingBank, setSubmittingBank] = useState(false);
  const [submittingRequirement, setSubmittingRequirement] = useState(false);
  const [uploadingValidId, setUploadingValidId] = useState(false);
  const [fetchingPin, setFetchingPin] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

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
  const validIdInputRef = useRef<HTMLInputElement>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const successBannerRef = useRef<HTMLDivElement>(null);

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
        ? String(requestedChanges.maritalStatus ?? '')
        : (payload.user.marital_status || ''),
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
  };

  const fetchRequirements = async () => {
    const res = await api.get('/account/employment/requirements');
    setRequirements(res.data.data || []);
  };

  useEffect(() => {
    Promise.all([fetchProfile(), fetchRequirements()])
      .catch((err: any) => {
        setError(err.response?.data?.error || 'Failed to load profile');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (error && errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [error]);

  useEffect(() => {
    if (success && successBannerRef.current) {
      successBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [success]);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 10) value = value.slice(0, 10);
    if (!value.startsWith('63') && value.length > 0) {
      value = `63${value}`;
    }
    setMobileNumber(value);
  };

  const handleGetPin = async () => {
    setError('');
    setSuccess('');
    setFetchingPin(true);
    try {
      const res = await api.post('/users/me/pin', {});
      setPin(res.data.data.pin || '');
      setSuccess('PIN code retrieved successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to get PIN code');
    } finally {
      setFetchingPin(false);
    }
  };

  const handleUploadValidId = async (file: File) => {
    setError('');
    setSuccess('');
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
      await fetchRequirements();
      setSuccess('Valid ID uploaded successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload valid ID');
    } finally {
      setUploadingValidId(false);
    }
  };

  const handleSubmitPersonalVerification = async () => {
    setError('');
    setSuccess('');
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
      await fetchProfile();
      setSuccess('Personal information submitted for verification.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit personal information verification');
    } finally {
      setSubmittingPersonal(false);
    }
  };

  const handleSubmitBankVerification = async () => {
    setError('');
    setSuccess('');
    if (!bankId || !bankAccountNumber.trim()) {
      setError('Bank and account number are required.');
      return;
    }

    setSubmittingBank(true);
    try {
      await api.post('/account/bank-information/verifications', {
        bankId: Number(bankId),
        accountNumber: bankAccountNumber.trim(),
      });
      await fetchProfile();
      setSuccess('Bank information submitted for verification.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit bank information verification');
    } finally {
      setSubmittingBank(false);
    }
  };

  const closeRequirementModal = () => {
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
      setSuccess(`${selectedRequirement.label} submitted for verification.`);
      closeRequirementModal();
      await fetchRequirements();
      await fetchProfile();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit requirement');
    } finally {
      setSubmittingRequirement(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const pendingMessage = 'You have submitted a pending verification for this information.';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <IdCard className="h-6 w-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
      </div>

      <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Employee Information</h2>
          <p className="mt-1 text-sm text-gray-500">
            Keep your personal, emergency contact, bank, and valid ID details updated.
          </p>
        </CardHeader>
        <CardBody className="space-y-6">
          {success && (
            <div
              ref={successBannerRef}
              className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </div>
          )}
          {error && (
            <div
              ref={errorBannerRef}
              className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20 shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Profile" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-gray-200">
                    <span className="text-2xl font-medium text-gray-500">
                      {firstName?.[0] || lastName?.[0] || '?'}
                    </span>
                  </div>
                )}
              </div>
              <div>
                <p className="font-medium text-gray-900">{`${firstName} ${lastName}`.trim() || 'Unnamed User'}</p>
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(true)}
                  className="mt-1 text-sm text-primary-600 hover:underline"
                >
                  Add/Change Profile Picture
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Changes are sent for verification first. Your profile and Odoo records are updated only after approval.
            </p>

            <div className="space-y-6">
              <div className="space-y-4 border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-900">Personal Information</h4>
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
                      placeholder="Enter your full legal name"
                      disabled={personalPending}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Marital Status</label>
                    <Input
                      type="text"
                      value={maritalStatus}
                      onChange={(e) => setMaritalStatus(e.target.value)}
                      placeholder="Enter marital status"
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
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-900">Private Contact</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Address</label>
                    <Input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Enter your address"
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

              <div className="space-y-4 border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-900">Government Identification &amp; Contributions</h4>
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

            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Emergency Contact Information</h3>
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
                  placeholder="Enter relationship"
                  disabled={personalPending}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Valid ID</h3>
            <p className="text-xs text-gray-500">
              Valid ID is required for personal information verification.
            </p>
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
                <span className="text-sm text-gray-500">No valid ID uploaded yet.</span>
              )}

              <input
                ref={validIdInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleUploadValidId(file);
                    e.currentTarget.value = '';
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => validIdInputRef.current?.click()}
                disabled={uploadingValidId}
              >
                <Upload className="mr-1 h-4 w-4" />
                {uploadingValidId ? 'Uploading...' : validIdUrl ? 'Replace Valid ID' : 'Upload Valid ID'}
              </Button>
            </div>
            <div className="flex justify-center sm:justify-end">
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <Button
                  type="button"
                  variant="success"
                  disabled={Boolean(personalPending) || submittingPersonal}
                  onClick={handleSubmitPersonalVerification}
                >
                  {submittingPersonal ? 'Submitting...' : 'Submit Personal Information for Verification'}
                </Button>
                {personalPending && (
                  <p className="text-xs text-amber-700">{pendingMessage}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Work Information</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Department</label>
                <Input
                  value={profile?.workInfo.department_name || 'Not set'}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Position</label>
                <Input
                  value={profile?.workInfo.position_title || 'Not set'}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Status</label>
                <Input
                  value={
                    profile?.workInfo.status === 'resigned'
                      ? 'Resigned'
                      : profile?.workInfo.status === 'inactive'
                        ? 'Inactive'
                        : 'Active'
                  }
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Date Started</label>
                <Input
                  value={profile?.workInfo.date_started || 'Not set'}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Days of Employment</label>
                <Input
                  value={profile?.workInfo.days_of_employment !== null && profile?.workInfo.days_of_employment !== undefined
                    ? String(profile.workInfo.days_of_employment)
                    : 'Not set'}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Company</label>
                <Input
                  value={profile?.workInfo.company?.name || 'Not set'}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Resident Branch</label>
                <Input
                  value={profile?.workInfo.resident_branch?.branch_name || 'N/A'}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              {!profile?.workInfo.resident_branch && profile?.workInfo.home_resident_branch && (
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Home Resident Branch</label>
                  <Input
                    value={`${profile.workInfo.home_resident_branch.branch_name} (${profile.workInfo.home_resident_branch.company_name})`}
                    readOnly
                    className="bg-gray-50"
                  />
                </div>
              )}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-sm font-medium text-gray-700">Borrow Branches</label>
                <Input
                  value={profile?.workInfo.borrow_branches?.length
                    ? profile.workInfo.borrow_branches.map((branch) => branch.branch_name).join(', ')
                    : 'None'}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Key className="h-4 w-4 text-gray-400" />
                  POS PIN Code
                </label>
                <div className="flex gap-2 sm:max-w-md">
                  <Input type="text" value={pin} readOnly placeholder="No PIN code" className="flex-1 bg-gray-50" />
                  {!pin && (
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
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-4">
            <h3 className="text-sm font-semibold text-gray-900">Bank Information</h3>
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
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
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
              <p className="text-xs text-amber-700">
                Bank information can be submitted again after {new Date(profile.bankCooldown.nextAllowedAt).toLocaleString()}.
              </p>
            )}

            <div className="flex justify-center sm:justify-end">
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <Button
                  type="button"
                  variant="success"
                  disabled={Boolean(bankPending) || Boolean(profile?.bankCooldown.cooldownActive) || submittingBank}
                  onClick={handleSubmitBankVerification}
                >
                  {submittingBank ? 'Submitting...' : 'Submit Bank Information for Verification'}
                </Button>
                {bankPending && (
                  <p className="text-xs text-amber-700">{pendingMessage}</p>
                )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

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
                <Button variant="secondary" onClick={closeRequirementModal} disabled={submittingRequirement}>
                  Close
                </Button>
                {selectedRequirement.display_status !== 'verification' && (
                  <Button variant="success" onClick={submitRequirement} disabled={submittingRequirement}>
                    <Upload className="mr-1 h-4 w-4" />
                    {submittingRequirement ? 'Submitting...' : 'Submit for Verification'}
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

      <ProfilePictureModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onUploadComplete={(url) => {
          setAvatarUrl(url);
          updateUser({ avatarUrl: url });
          setSuccess('Profile picture updated successfully.');
          void fetchProfile();
        }}
      />
      </div>
    </div>
  );
}
