import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Cropper from 'react-easy-crop';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  UserPlus,
  FileImage,
  IdCard,
  Lock,
  Upload,
  User,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';
import { useAuthSidebar } from '../components/AuthLayout';

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

const steps: Array<{
  id: StepId;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  title: string;
}> = [
    {
      id: 'personal',
      label: 'Personal',
      subtitle: 'Your basic information',
      icon: <User className="h-4 w-4" />,
      title: 'Personal details',
    },
    {
      id: 'employment',
      label: 'Employment',
      subtitle: 'Government IDs & emergency contact',
      icon: <IdCard className="h-4 w-4" />,
      title: 'Employment details',
    },
    {
      id: 'documents',
      label: 'Documents',
      subtitle: 'Profile photo & valid ID',
      icon: <FileImage className="h-4 w-4" />,
      title: 'Upload documents',
    },
    {
      id: 'account',
      label: 'Account',
      subtitle: 'Set your login credentials',
      icon: <Lock className="h-4 w-4" />,
      title: 'Account credentials',
    },
  ];

// ── Animation variants ────────────────────────────────────────────────────────

const stepVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 24 : -24 }),
  center: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 340, damping: 30 },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -24 : 24,
  }),
};

const fieldContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const fieldItemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
};

const nextButtonVariants = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 420, damping: 22 },
  },
  exit: { opacity: 0, scale: 0.88, transition: { duration: 0.12 } },
};

const checkmarkVariants = {
  hidden: { scale: 0, rotate: -45 },
  visible: {
    scale: 1,
    rotate: 0,
    transition: { type: 'spring' as const, stiffness: 500, damping: 22 },
  },
};

const successContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};

const successItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { score: 1, label: 'Weak', color: 'bg-red-400' },
    { score: 2, label: 'Fair', color: 'bg-amber-400' },
    { score: 3, label: 'Good', color: 'bg-yellow-400' },
    { score: 4, label: 'Strong', color: 'bg-emerald-400' },
    { score: 5, label: 'Very strong', color: 'bg-emerald-500' },
  ];
  return map[Math.min(score, 5) - 1] ?? { score: 0, label: '', color: '' };
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

// ── Component ─────────────────────────────────────────────────────────────────

export function RegisterPage() {
  const [draft, setDraft] = useState<RegistrationDraft>(() => loadDraft());
  const [direction, setDirection] = useState(1);
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
    const currentIndex = steps.findIndex((s) => s.id === draft.step);
    const nextIndex = steps.findIndex((s) => s.id === step);
    setDirection(nextIndex >= currentIndex ? 1 : -1);
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
        <motion.div variants={fieldContainerVariants} initial="hidden" animate="visible" className="space-y-3 sm:space-y-5">
          <motion.div variants={fieldItemVariants} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_80px]">
            <Input label="First Name" value={draft.firstName} onChange={(e) => updateDraft({ firstName: e.target.value })} />
            <Input label="Middle Name" placeholder="N/A if none" value={draft.middleName} onChange={(e) => updateDraft({ middleName: e.target.value })} />
            <Input label="Last Name" value={draft.lastName} onChange={(e) => updateDraft({ lastName: e.target.value })} />
            <Input label="Suffix" placeholder="Jr." value={draft.suffix} onChange={(e) => updateDraft({ suffix: e.target.value })} />
          </motion.div>

          <motion.div variants={fieldItemVariants} className="grid gap-3 sm:grid-cols-2">
            <Input label="Birthday" type="date" value={draft.birthday} onChange={(e) => updateDraft({ birthday: e.target.value })} />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Gender</span>
              <select
                value={draft.gender}
                onChange={(e) => updateDraft({ gender: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </motion.div>

          <motion.div variants={fieldItemVariants} className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Marital Status</span>
              <select
                value={draft.maritalStatus}
                onChange={(e) => updateDraft({ maritalStatus: e.target.value })}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {MARITAL_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <Input label="Mobile Number" placeholder="+639123456789" value={draft.mobileNumber} onChange={(e) => updateDraft({ mobileNumber: e.target.value })} />
          </motion.div>

          <motion.div variants={fieldItemVariants}>
            <Input label="Home Address" value={draft.address} onChange={(e) => updateDraft({ address: e.target.value })} />
          </motion.div>

          <motion.div variants={fieldItemVariants} className="flex justify-end pt-1">
            <AnimatePresence>
              {personalComplete && (
                <motion.div key="next-personal" variants={nextButtonVariants} initial="hidden" animate="visible" exit="exit">
                  <Button type="button" onClick={() => goToStep('employment')}>
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      );
    }

    if (draft.step === 'employment') {
      return (
        <motion.div variants={fieldContainerVariants} initial="hidden" animate="visible" className="space-y-4 sm:space-y-6">
          <motion.div variants={fieldItemVariants}>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400 sm:mb-3">Government IDs</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="SSS Number" value={draft.sssNumber} onChange={(e) => updateDraft({ sssNumber: e.target.value })} />
              <Input label="TIN Number" value={draft.tinNumber} onChange={(e) => updateDraft({ tinNumber: e.target.value })} />
              <Input label="Pag-IBIG Number" value={draft.pagibigNumber} onChange={(e) => updateDraft({ pagibigNumber: e.target.value })} />
              <Input label="PhilHealth Number" value={draft.philhealthNumber} onChange={(e) => updateDraft({ philhealthNumber: e.target.value })} />
            </div>
          </motion.div>

          <motion.div variants={fieldItemVariants} className="rounded-xl border border-gray-200/70 bg-white/60 p-3 sm:p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400 sm:mb-3">Emergency Contact</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Contact Name" value={draft.emergencyContact} onChange={(e) => updateDraft({ emergencyContact: e.target.value })} />
              <Input label="Contact Number" value={draft.emergencyPhone} onChange={(e) => updateDraft({ emergencyPhone: e.target.value })} />
              <Input label="Relationship" value={draft.emergencyRelationship} onChange={(e) => updateDraft({ emergencyRelationship: e.target.value })} />
            </div>
          </motion.div>

          <motion.div variants={fieldItemVariants} className="flex items-center justify-between pt-2">
            <Button type="button" variant="secondary" onClick={() => goToStep('personal')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => goToStep('documents')}
                className="text-sm font-medium text-gray-400 underline-offset-2 hover:text-gray-700 hover:underline"
              >
                Skip for now
              </button>
              <AnimatePresence>
                {employmentHasAny && (
                  <motion.div key="next-employment" variants={nextButtonVariants} initial="hidden" animate="visible" exit="exit">
                    <Button type="button" onClick={() => goToStep('documents')}>
                      Continue <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      );
    }

    if (draft.step === 'documents') {
      return (
        <motion.div variants={fieldContainerVariants} initial="hidden" animate="visible" className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Profile Picture card — cropper lives inside this card */}
            <motion.div variants={fieldItemVariants} className="rounded-xl border border-gray-200/60 bg-white/70 p-5">
              <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                <User className="h-3.5 w-3.5" /> Profile Picture
              </p>

              <AnimatePresence mode="wait">
                {cropSource ? (
                  /* Inline cropper — replaces the preview while active */
                  <motion.div
                    key="cropper"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div className="relative h-56 overflow-hidden rounded-xl bg-gray-900">
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
                    <div className="mt-3 flex items-center gap-3">
                      <span className="shrink-0 text-xs font-medium text-gray-500">Zoom</span>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.1}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="w-full accent-primary-600"
                      />
                      <Button type="button" size="sm" onClick={commitProfileCrop}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Use
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  /* Normal preview + upload button */
                  <motion.div
                    key="preview"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-4"
                  >
                    {profilePreview ? (
                      <img
                        src={profilePreview}
                        alt="Profile preview"
                        className="h-28 w-28 rounded-full border-4 border-white object-cover shadow-md ring-2 ring-primary-100"
                      />
                    ) : (
                      <div className="flex h-28 w-28 items-center justify-center rounded-full border-2 border-dashed border-primary-200 bg-primary-50/50 text-primary-300">
                        <User className="h-10 w-10" />
                      </div>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-400 hover:bg-gray-50">
                      <Upload className="h-4 w-4" />
                      {profilePreview ? 'Change Photo' : 'Choose Photo'}
                      <input
                        type="file"
                        accept="image/*,.heic,.heif"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void handleProfileSelect(f);
                        }}
                      />
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Valid ID card */}
            <motion.div variants={fieldItemVariants} className="rounded-xl border border-gray-200/60 bg-white/70 p-5">
              <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                <IdCard className="h-3.5 w-3.5" /> Valid ID
              </p>
              {validIdPreview ? (
                <img
                  src={validIdPreview}
                  alt="Valid ID preview"
                  className="mb-4 h-36 w-full rounded-lg border border-gray-200 object-cover shadow-sm"
                />
              ) : (
                <div className="mb-4 flex h-36 items-center justify-center rounded-lg border-2 border-dashed border-primary-200 bg-primary-50/50 text-primary-300">
                  <IdCard className="h-10 w-10" />
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-400 hover:bg-gray-50">
                <Upload className="h-4 w-4" />
                {validIdPreview ? 'Replace ID Image' : 'Choose ID Image'}
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleValidIdSelect(f);
                  }}
                />
              </label>
            </motion.div>
          </div>

          <motion.div variants={fieldItemVariants} className="flex items-center justify-between pt-2">
            <Button type="button" variant="secondary" onClick={() => goToStep('employment')}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <AnimatePresence>
              {documentsComplete && (
                <motion.div key="next-documents" variants={nextButtonVariants} initial="hidden" animate="visible" exit="exit">
                  <Button type="button" onClick={() => goToStep('account')}>
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      );
    }

    // Account step
    const strength = getPasswordStrength(password);
    return (
      <motion.div variants={fieldContainerVariants} initial="hidden" animate="visible" className="space-y-3 sm:space-y-5">
        <motion.div variants={fieldItemVariants}>
          <Input label="Email Address" type="email" value={draft.email} onChange={(e) => updateDraft({ email: e.target.value })} />
        </motion.div>

        <motion.div variants={fieldItemVariants}>
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {/* Password requirements — shown as soon as user starts typing */}
          <AnimatePresence>
            {password.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/80 p-3"
              >
                {/* Strength bar */}
                <div className="mb-2.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                    <motion.div
                      className={`h-full rounded-full ${strength.color}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(strength.score / 5) * 100}%` }}
                      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                    />
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${strength.score >= 4 ? 'text-emerald-600' : strength.score >= 3 ? 'text-amber-600' : 'text-red-500'}`}>
                    {strength.label}
                  </span>
                </div>
                {/* Per-rule checklist */}
                <ul className="space-y-1">
                  {[
                    { met: password.length >= 6, label: 'At least 6 characters' },
                    { met: password.length >= 10, label: '10+ characters (recommended)' },
                    { met: /[A-Z]/.test(password), label: 'One uppercase letter' },
                    { met: /[0-9]/.test(password), label: 'One number' },
                    { met: /[^A-Za-z0-9]/.test(password), label: 'One special character (!@#$…)' },
                  ].map(({ met, label }) => (
                    <li key={label} className={`flex items-center gap-2 text-xs transition-colors ${met ? 'text-emerald-600' : 'text-gray-400'}`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${met ? 'bg-emerald-100' : 'bg-gray-200'}`}>
                        {met
                          ? <Check className="h-2.5 w-2.5" />
                          : <span className="h-1 w-1 rounded-full bg-gray-400" />}
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div variants={fieldItemVariants}>
          <Input label="Confirm Password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          {confirmPassword.length > 0 && (
            <p className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${password === confirmPassword ? 'text-emerald-600' : 'text-red-500'}`}>
              {password === confirmPassword
                ? <><Check className="h-3 w-3" /> Passwords match</>
                : 'Passwords do not match'}
            </p>
          )}
        </motion.div>

        <motion.div variants={fieldItemVariants} className="flex items-center justify-between pt-2">
          <Button type="button" variant="secondary" onClick={() => goToStep('documents')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button type="button" disabled={!credentialsComplete || submitting} onClick={submitRegistration}>
            {submitting ? 'Submitting...' : 'Create Account'} <Check className="ml-2 h-4 w-4" />
          </Button>
        </motion.div>
      </motion.div>
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

  useAuthSidebar(
    <>
      {/* Top content */}
      <div className="relative z-10 p-8">
        <div
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <UserPlus className="h-3 w-3 text-amber-400" />
          Register
        </div>

        <h1 className="mt-7 text-3xl font-bold leading-tight tracking-tight text-white">
          Welcome to<br />
          <span className="text-amber-400">the team.</span>
        </h1>

        <p className="mt-3 max-w-[22ch] text-sm leading-relaxed text-white/55">
          Complete the onboarding steps to get started.
        </p>
      </div>

      {/* Vertical stepper */}
      <div className="relative z-10 px-8 pb-4">
        {(success ? [
          ...steps,
          {
            id: 'success',
            label: 'Submitted',
            subtitle: 'Pending HR review',
            icon: <Check className="h-4 w-4" />,
            title: 'Submitted'
          }
        ] : steps).map((step, index, arr) => {
          const active = success ? false : step.id === draft.step;
          const complete = success ? true : index < stepIndex;
          const upcoming = success ? false : index > stepIndex;
          const isLast = index === arr.length - 1;

          return (
            <div key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <motion.div
                  layout
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors',
                    active ? 'border-amber-400 bg-amber-400 text-primary-800' : '',
                    complete ? 'border-emerald-400 bg-emerald-400 text-primary-800' : '',
                    upcoming ? 'border-white/20 bg-transparent text-white/40' : '',
                  ].join(' ')}
                  animate={active ? { boxShadow: ['0 0 0 0px rgba(251,191,36,0.5)', '0 0 0 6px rgba(251,191,36,0)'] } : complete ? { boxShadow: '0 0 0 3px rgba(52,211,153,0.18)' } : { boxShadow: '0 0 0 0px transparent' }}
                  transition={active ? { duration: 1.4, repeat: Infinity, ease: 'easeOut' } : { duration: 0.3 }}
                >
                  <AnimatePresence mode="wait">
                    {complete ? (
                      <motion.span key="check" variants={checkmarkVariants} initial="hidden" animate="visible">
                        <Check className="h-3.5 w-3.5" />
                      </motion.span>
                    ) : (
                      <motion.span key="num" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {index + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>

                {!isLast && (
                  <div
                    className="relative my-1 w-px flex-1 overflow-hidden"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)', minHeight: '20px' }}
                  >
                    <motion.div
                      className="absolute left-0 top-0 w-full rounded-full bg-emerald-400"
                      initial={false}
                      animate={{ height: complete ? '100%' : '0%' }}
                      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                    />
                  </div>
                )}
              </div>

              <div className={`pb-5 pt-1 ${isLast ? 'pb-0' : ''}`}>
                <p className={`text-sm font-semibold ${active ? 'text-white' : complete ? 'text-white/70' : 'text-white/35'}`}>
                  {step.label}
                </p>
                <p className={`text-xs ${active ? 'text-white/60' : 'text-white/25'}`}>
                  {step.subtitle}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom ornament */}
      <div className="relative z-10 p-8 pt-0">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Omnilert</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      </div>
    </>,
    [draft.step, stepIndex]
  );

  return (
    <>
      {/* Mobile progress bar */}
      {!success && (
        <div className="border-b border-gray-200/60 bg-white/80 px-5 py-3 backdrop-blur-sm lg:hidden">
          <div className="mb-2 flex items-center justify-between">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to login
            </Link>
            <span className="text-xs font-semibold text-primary-600">
              {steps[stepIndex]?.label} — {stepIndex + 1}/{steps.length}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <motion.div
              className="h-full rounded-full bg-amber-400"
              initial={false}
              animate={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
              transition={{ type: 'spring', stiffness: 280, damping: 28 }}
            />
          </div>
        </div>
      )}

      {/* Desktop back link */}
      {!success && (
        <div className="hidden px-10 pt-8 lg:block">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to login
          </Link>
        </div>
      )}

      <div className="flex flex-1 flex-col justify-start px-5 py-5 sm:justify-center sm:px-10 sm:py-10 lg:px-14 lg:py-12">
        <div className="mx-auto w-full max-w-2xl">
          <AnimatePresence mode="wait" custom={direction}>
            {success ? (
              <motion.div
                key="success"
                variants={successContainerVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-10 text-center sm:min-h-[34rem]"
              >
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 20, delay: 0.1 }}
                  className="relative mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100"
                >
                  <motion.div
                    className="absolute inset-0 rounded-full bg-emerald-100"
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 1.2, delay: 0.4, repeat: Infinity, repeatDelay: 1.5 }}
                  />
                  <Check className="h-9 w-9 text-emerald-600" strokeWidth={2.5} />
                </motion.div>

                <motion.h2 variants={successItemVariants} className="text-2xl font-bold tracking-tight text-gray-950">
                  Registration submitted!
                </motion.h2>

                <motion.p variants={successItemVariants} className="mt-3 max-w-sm text-sm leading-relaxed text-gray-500">
                  Your profile is now with HR for review. Complete your Discord verification to join our communication channels.
                </motion.p>

                {discordInviteUrl && (
                  <motion.div variants={successItemVariants} className="mt-8">
                    <a
                      href={discordInviteUrl}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4752c4]"
                    >
                      Join the team on Discord
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </motion.div>
                )}

                <motion.p variants={successItemVariants} className="mt-4 text-xs text-gray-400">
                  You may close this tab.
                </motion.p>
              </motion.div>
            ) : (
              <motion.div
                key={draft.step}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {/* Step header */}
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 [&>svg]:h-5 [&>svg]:w-5">
                    {steps[stepIndex]?.icon}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">
                      Step {stepIndex + 1} — {steps[stepIndex]?.label}
                    </p>
                    <h2 className="mt-0.5 text-xl font-bold tracking-tight text-gray-950 sm:text-2xl">
                      {steps[stepIndex]?.title}
                    </h2>
                    <p className="mt-0.5 text-sm text-gray-400">
                      {steps[stepIndex]?.subtitle}
                    </p>
                  </div>
                </div>

                {/* Error banner */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span className="flex-1">{error}</span>
                      <button type="button" onClick={() => setError('')} className="shrink-0 text-red-400 hover:text-red-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {stepContent}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
