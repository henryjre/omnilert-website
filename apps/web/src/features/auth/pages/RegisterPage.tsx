import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Cropper from 'react-easy-crop';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  FileImage,
  IdCard,
  Lock,
  Mail,
  Sparkles,
  Upload,
  User,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';

const DRAFT_KEY = 'omnilert.registration.v1';
const DB_NAME = 'omnilert-registration-draft';
const DB_STORE = 'files';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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

type StepId = 'personal' | 'employment' | 'documents' | 'account' | 'success';
type DraftFileKey = 'profilePicture' | 'validId';

type RegistrationDraft = {
  step: StepId;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  birthday: string;
  gender: string;
  maritalStatus: string;
  address: string;
  mobileNumber: string;
  sssNumber: string;
  tinNumber: string;
  pagibigNumber: string;
  philhealthNumber: string;
  emergencyContact: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  email: string;
};

const EMPTY_DRAFT: RegistrationDraft = {
  step: 'personal',
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  birthday: '',
  gender: '',
  maritalStatus: '',
  address: '',
  mobileNumber: '',
  sssNumber: '',
  tinNumber: '',
  pagibigNumber: '',
  philhealthNumber: '',
  emergencyContact: '',
  emergencyPhone: '',
  emergencyRelationship: '',
  email: '',
};

const steps: Array<{ id: StepId; label: string }> = [
  { id: 'personal', label: 'Personal' },
  { id: 'employment', label: 'Employment' },
  { id: 'documents', label: 'Documents' },
  { id: 'account', label: 'Account' },
];

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putDraftFile(key: DraftFileKey, file: File): Promise<void> {
  const database = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, 'readwrite');
    transaction.objectStore(DB_STORE).put(file, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function getDraftFile(key: DraftFileKey): Promise<File | null> {
  const database = await openDraftDb();
  const file = await new Promise<File | null>((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, 'readonly');
    const request = transaction.objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve((request.result as File | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return file;
}

async function clearDraftFiles(): Promise<void> {
  const database = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DB_STORE, 'readwrite');
    transaction.objectStore(DB_STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function loadDraft(): RegistrationDraft {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '');
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return EMPTY_DRAFT;
  }
}

function revokeUrl(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

function sanitizeImageFile(file: File): void {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error('Only image files are accepted.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Images must be 10 MB or smaller.');
  }
}

function createCroppedProfileFile(
  imageSrc: string,
  cropPixels: { x: number; y: number; width: number; height: number },
): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = Math.min(cropPixels.width, cropPixels.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(size));
      canvas.height = Math.max(1, Math.round(size));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Unable to crop image.'));
        return;
      }
      ctx.drawImage(
        image,
        cropPixels.x,
        cropPixels.y,
        cropPixels.width,
        cropPixels.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Unable to crop image.'));
          return;
        }
        resolve(new File([blob], 'profile-picture.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.9);
    };
    image.onerror = () => reject(new Error('Unable to load image.'));
    image.src = imageSrc;
  });
}

export function RegisterPage() {
  const [draft, setDraft] = useState<RegistrationDraft>(() => loadDraft());
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [validIdFile, setValidIdFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [validIdPreview, setValidIdPreview] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [discordInviteUrl, setDiscordInviteUrl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const stepIndex = Math.max(0, steps.findIndex((step) => step.id === draft.step));

  useEffect(() => {
    if (draft.step !== 'success') {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  }, [draft]);

  useEffect(() => {
    axios.get('/api/v1/auth/public-config')
      .then((res) => setDiscordInviteUrl(String(res.data?.data?.discordInviteUrl ?? '')))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([getDraftFile('profilePicture'), getDraftFile('validId')])
      .then(([storedProfile, storedValidId]) => {
        if (!mounted) return;
        if (storedProfile) {
          setProfileFile(storedProfile);
          setProfilePreview(URL.createObjectURL(storedProfile));
        }
        if (storedValidId) {
          setValidIdFile(storedValidId);
          setValidIdPreview(URL.createObjectURL(storedValidId));
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => () => {
    revokeUrl(profilePreview);
    revokeUrl(validIdPreview);
    revokeUrl(cropSource);
  }, [profilePreview, validIdPreview, cropSource]);

  const updateDraft = (patch: Partial<RegistrationDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const goToStep = (step: StepId) => {
    setError('');
    updateDraft({ step });
  };

  const personalComplete = useMemo(
    () => Boolean(
      draft.firstName.trim()
      && draft.middleName.trim()
      && draft.lastName.trim()
      && draft.birthday
      && draft.gender
      && draft.maritalStatus
      && draft.address.trim()
      && draft.mobileNumber.trim(),
    ),
    [draft],
  );

  const employmentHasAny = useMemo(
    () => Boolean(
      draft.sssNumber.trim()
      || draft.tinNumber.trim()
      || draft.pagibigNumber.trim()
      || draft.philhealthNumber.trim()
      || draft.emergencyContact.trim()
      || draft.emergencyPhone.trim()
      || draft.emergencyRelationship.trim(),
    ),
    [draft],
  );

  const documentsComplete = Boolean(profileFile && validIdFile);
  const credentialsComplete = Boolean(draft.email.trim() && password.length >= 6 && password === confirmPassword);

  const handleProfileSelect = async (file: File) => {
    setError('');
    try {
      sanitizeImageFile(file);
      const normalized = await normalizeFileForUpload(file);
      sanitizeImageFile(normalized);
      revokeUrl(cropSource);
      setCropSource(URL.createObjectURL(normalized));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCropPixels(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read profile picture.');
    }
  };

  const commitProfileCrop = async () => {
    if (!cropSource || !cropPixels) return;
    setError('');
    try {
      const cropped = await createCroppedProfileFile(cropSource, cropPixels);
      sanitizeImageFile(cropped);
      await putDraftFile('profilePicture', cropped);
      setProfileFile(cropped);
      revokeUrl(profilePreview);
      setProfilePreview(URL.createObjectURL(cropped));
      revokeUrl(cropSource);
      setCropSource(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to crop profile picture.');
    }
  };

  const handleValidIdSelect = async (file: File) => {
    setError('');
    try {
      sanitizeImageFile(file);
      const normalized = await normalizeFileForUpload(file);
      sanitizeImageFile(normalized);
      await putDraftFile('validId', normalized);
      setValidIdFile(normalized);
      revokeUrl(validIdPreview);
      setValidIdPreview(URL.createObjectURL(normalized));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read valid ID image.');
    }
  };

  const submitRegistration = async () => {
    if (!credentialsComplete || !profileFile || !validIdFile) {
      setError('Complete all registration requirements before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      Object.entries(draft).forEach(([key, value]) => {
        if (key !== 'step') formData.append(key, String(value ?? ''));
      });
      formData.append('password', password);
      formData.append('profilePicture', profileFile, profileFile.name || 'profile-picture.jpg');
      formData.append('validId', validIdFile, validIdFile.name || 'valid-id.jpg');

      await axios.post('/api/v1/auth/register', formData);
      localStorage.removeItem(DRAFT_KEY);
      await clearDraftFiles();
      setPassword('');
      setConfirmPassword('');
      updateDraft({ ...EMPTY_DRAFT, step: 'success' });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const stepContent = useMemo(() => {
    if (draft.step === 'personal') {
      return (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-10">
            <Input className="md:col-span-3" label="First Name" value={draft.firstName} onChange={(e) => updateDraft({ firstName: e.target.value })} />
            <Input className="md:col-span-3" label="Middle Name" placeholder="N/A if none" value={draft.middleName} onChange={(e) => updateDraft({ middleName: e.target.value })} />
            <Input className="md:col-span-3" label="Last Name" value={draft.lastName} onChange={(e) => updateDraft({ lastName: e.target.value })} />
            <Input className="md:col-span-1" label="Suffix" placeholder="Jr." value={draft.suffix} onChange={(e) => updateDraft({ suffix: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Birthday" type="date" value={draft.birthday} onChange={(e) => updateDraft({ birthday: e.target.value })} />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Gender</span>
              <select value={draft.gender} onChange={(e) => updateDraft({ gender: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                {GENDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Marital Status</span>
              <select value={draft.maritalStatus} onChange={(e) => updateDraft({ maritalStatus: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500">
                {MARITAL_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <Input label="Mobile Number" placeholder="+639123456789" value={draft.mobileNumber} onChange={(e) => updateDraft({ mobileNumber: e.target.value })} />
            <Input className="sm:col-span-2" label="Home Address" value={draft.address} onChange={(e) => updateDraft({ address: e.target.value })} />
          </div>
          <AnimatePresence>
            {personalComplete && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="flex justify-end">
                <Button type="button" onClick={() => goToStep('employment')}>
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    if (draft.step === 'employment') {
      return (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="SSS Number" value={draft.sssNumber} onChange={(e) => updateDraft({ sssNumber: e.target.value })} />
            <Input label="TIN Number" value={draft.tinNumber} onChange={(e) => updateDraft({ tinNumber: e.target.value })} />
            <Input label="Pag-IBIG Number" value={draft.pagibigNumber} onChange={(e) => updateDraft({ pagibigNumber: e.target.value })} />
            <Input label="PhilHealth Number" value={draft.philhealthNumber} onChange={(e) => updateDraft({ philhealthNumber: e.target.value })} />
          </div>
          <div className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-3">
            <Input label="Contact Name" value={draft.emergencyContact} onChange={(e) => updateDraft({ emergencyContact: e.target.value })} />
            <Input label="Contact Number" value={draft.emergencyPhone} onChange={(e) => updateDraft({ emergencyPhone: e.target.value })} />
            <Input label="Relationship" value={draft.emergencyRelationship} onChange={(e) => updateDraft({ emergencyRelationship: e.target.value })} />
          </div>
          <div className="flex items-center justify-between">
            <Button type="button" variant="secondary" onClick={() => goToStep('personal')}>
              <ChevronLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => goToStep('documents')}>Skip</Button>
              <AnimatePresence>
                {employmentHasAny && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                    <Button type="button" onClick={() => goToStep('documents')}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      );
    }

    if (draft.step === 'documents') {
      return (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <User className="h-4 w-4 text-primary-600" /> Profile Picture
              </div>
              {profilePreview ? (
                <img src={profilePreview} alt="Profile preview" className="h-40 w-40 rounded-full border border-gray-200 object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-400">
                  <FileImage className="h-9 w-9" />
                </div>
              )}
              <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                <Upload className="mr-2 h-4 w-4" /> Choose Photo
                <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleProfileSelect(file);
                }} />
              </label>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <IdCard className="h-4 w-4 text-primary-600" /> Valid ID
              </div>
              {validIdPreview ? (
                <img src={validIdPreview} alt="Valid ID preview" className="h-40 w-full rounded-lg border border-gray-200 object-cover" />
              ) : (
                <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-400">
                  <IdCard className="h-9 w-9" />
                </div>
              )}
              <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                <Upload className="mr-2 h-4 w-4" /> Choose ID Image
                <input type="file" accept="image/*,.heic,.heif" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void handleValidIdSelect(file);
                }} />
              </label>
            </div>
          </div>

          {cropSource && (
            <div className="rounded-lg border border-primary-100 bg-white p-4">
              <div className="relative h-72 overflow-hidden rounded-lg bg-gray-900">
                <Cropper
                  image={cropSource}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, pixels) => setCropPixels(pixels)}
                />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-xs font-medium text-gray-500">Zoom</span>
                <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
                <Button type="button" onClick={commitProfileCrop}>Use Photo</Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button type="button" variant="secondary" onClick={() => goToStep('employment')}>
              <ChevronLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <AnimatePresence>
              {documentsComplete && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                  <Button type="button" onClick={() => goToStep('account')}>Next <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <Input label="Email" type="email" value={draft.email} onChange={(e) => updateDraft({ email: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={() => goToStep('documents')}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button type="button" disabled={!credentialsComplete || submitting} onClick={submitRegistration}>
            {submitting ? 'Submitting...' : 'Register'} <Check className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }, [
    confirmPassword,
    crop,
    cropPixels,
    cropSource,
    credentialsComplete,
    documentsComplete,
    draft,
    employmentHasAny,
    password,
    personalComplete,
    profilePreview,
    submitting,
    validIdPreview,
    zoom,
  ]);

  const success = draft.step === 'success';

  return (
    <div className="min-h-screen bg-[#f5f7f4] px-4 py-8 text-gray-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Link to="/login" className="inline-flex w-fit items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="grid lg:grid-cols-[0.85fr_1.15fr]">
            <aside className="bg-[#12312b] p-6 text-white sm:p-8">
              <div className="flex h-full flex-col justify-between gap-10">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                    <Sparkles className="h-3.5 w-3.5" /> Omnilert onboarding
                  </div>
                  <h1 className="mt-6 text-3xl font-bold tracking-normal sm:text-4xl">Registration</h1>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-white/72">
                    Submit your employee details for manager verification.
                  </p>
                </div>

                {!success && (
                  <div className="space-y-3">
                    {steps.map((step, index) => {
                      const active = step.id === draft.step;
                      const complete = index < stepIndex;
                      return (
                        <div key={step.id} className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-white text-[#12312b]' : complete ? 'bg-emerald-400 text-[#12312b]' : 'bg-white/12 text-white/70'}`}>
                            {complete ? <Check className="h-4 w-4" /> : index + 1}
                          </div>
                          <span className={active ? 'font-semibold text-white' : 'text-white/65'}>{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>

            <main className="p-5 sm:p-8">
              <AnimatePresence mode="wait">
                {success ? (
                  <motion.div key="success" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex min-h-[30rem] flex-col items-center justify-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                      <Check className="h-8 w-8" />
                    </div>
                    <h2 className="mt-5 text-2xl font-bold text-gray-950">Registration submitted</h2>
                    <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
                      Your request is ready for HR review. You will receive your approval notice after verification.
                    </p>
                    <a href={discordInviteUrl || '#'} className="mt-6 inline-flex items-center rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4752c4]">
                      Go to Discord <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </motion.div>
                ) : (
                  <motion.div key={draft.step} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.22 }} className="min-h-[34rem]">
                    <div className="mb-6 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">{steps[stepIndex]?.label}</p>
                        <h2 className="mt-1 text-2xl font-bold text-gray-950">
                          {draft.step === 'personal' && 'Personal details'}
                          {draft.step === 'employment' && 'Employment details'}
                          {draft.step === 'documents' && 'Profile picture and valid ID'}
                          {draft.step === 'account' && 'Account credentials'}
                        </h2>
                      </div>
                      {draft.step === 'account' ? <Lock className="h-6 w-6 text-gray-300" /> : <Mail className="h-6 w-6 text-gray-300" />}
                    </div>

                    {error && (
                      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                      </div>
                    )}

                    {stepContent}
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
