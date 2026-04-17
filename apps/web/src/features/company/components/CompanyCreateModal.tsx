import { useState, useRef } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { isValidHexColor } from '@/shared/utils/theme';
import type { Company } from './CompanyCard';
import { CompanyAvatar } from './CompanyAvatar';

const PRESET_COLORS = ['#2563EB', '#16A34A', '#DC2626', '#EA580C', '#7C3AED', '#0D9488'];
const COMPANY_CODE_RE = /^[A-Z0-9]{2,10}$/;

interface CompanyCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (company: Company) => void;
}

type Step = 'form' | 'auth';

interface FormState {
  name: string;
  companyCode: string;
  odooApiKey: string;
  themeColor: string;
}

export function CompanyCreateModal({ isOpen, onClose, onCreated }: CompanyCreateModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState<FormState>({
    name: '',
    companyCode: '',
    odooApiKey: '',
    themeColor: '#2563EB',
  });
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoFile(file);
    setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  function resetAndClose() {
    setStep('form');
    setForm({ name: '', companyCode: '', odooApiKey: '', themeColor: '#2563EB' });
    setAuthEmail('');
    setAuthPassword('');
    setError('');
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoFile(null);
    setLogoPreviewUrl(null);
    onClose();
  }

  function handleClose() {
    if (submitting) return;
    resetAndClose();
  }

  function handleFormNext() {
    setError('');
    if (!form.name.trim()) {
      setError('Company name is required.');
      return;
    }
    if (!COMPANY_CODE_RE.test(form.companyCode.trim().toUpperCase())) {
      setError('Company code must be 2-10 uppercase letters/numbers (e.g. FBW).');
      return;
    }
    if (!isValidHexColor(form.themeColor)) {
      setError('Theme color must be a valid hex color (e.g. #2563EB).');
      return;
    }
    setStep('auth');
  }

  async function handleSubmit() {
    setError('');
    if (!authEmail.trim() || !authPassword) {
      setError('Super admin credentials are required.');
      return;
    }
    setSubmitting(true);
    try {
      const authRes = await fetch('/api/v1/super/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      });
      const authData = await authRes.json();
      if (!authRes.ok || !authData.data?.accessToken) {
        setError(authData.error || 'Invalid super admin credentials.');
        return;
      }

      const createRes = await fetch('/api/v1/super/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.data.accessToken}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          companyCode: form.companyCode.trim().toUpperCase(),
          odooApiKey: form.odooApiKey.trim() || undefined,
          themeColor: form.themeColor,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error || 'Failed to create company.');
        return;
      }

      let createdCompany = createData.data as Company;

      let logoUploadFailed = false;

      if (logoFile) {
        try {
          const formData = new FormData();
          formData.append('logo', logoFile);
          const logoRes = await fetch(`/api/v1/super/companies/${createdCompany.id}/logo`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${authData.data.accessToken}` },
            body: formData,
          });
          if (logoRes.ok) {
            const logoData = await logoRes.json();
            createdCompany = logoData.data as Company;
          } else {
            logoUploadFailed = true;
            setError('Company created, but logo upload failed. You can upload it from the detail panel.');
          }
        } catch {
          logoUploadFailed = true;
          setError('Company created, but logo upload failed. You can upload it from the detail panel.');
        }
      }

      onCreated(createdCompany);
      if (!logoUploadFailed) resetAndClose();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {step === 'form' ? 'Create New Company' : 'Super Admin Authentication'}
          </h3>
        </div>

        <div className="space-y-4 px-6 py-5">
          {step === 'form' ? (
            <>
              {/* Logo preview + upload */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Company Logo <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <div className="flex items-center gap-4">
                  <CompanyAvatar
                    name={form.name || 'N'}
                    logoUrl={logoPreviewUrl}
                    themeColor={isValidHexColor(form.themeColor) ? form.themeColor : '#2563EB'}
                    size={80}
                    className="rounded-xl"
                  />
                  <div>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {logoFile ? 'Change' : 'Upload'}
                    </button>
                    <p className="mt-1 text-xs text-gray-400">JPEG, PNG, WebP or GIF · max 5 MB</p>
                  </div>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleLogoFileChange}
                />
              </div>
              <Input
                label="Company Name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Famous Belgian Waffles"
              />
              <Input
                label="Company Code"
                value={form.companyCode}
                onChange={(e) =>
                  setForm((p) => ({ ...p, companyCode: e.target.value.toUpperCase() }))
                }
                placeholder="2-10 uppercase letters/numbers (e.g. FBW)"
                maxLength={10}
              />
              <Input
                label="Odoo API Key (optional)"
                value={form.odooApiKey}
                onChange={(e) => setForm((p) => ({ ...p, odooApiKey: e.target.value }))}
                placeholder="Paste your Odoo API key"
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Theme Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, themeColor: color }))}
                      className={`h-8 w-8 rounded-full border-2 transition-all ${
                        form.themeColor === color
                          ? 'scale-110 border-gray-900'
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={isValidHexColor(form.themeColor) ? form.themeColor : '#2563EB'}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, themeColor: e.target.value.toUpperCase() }))
                    }
                    className="h-9 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                  />
                  <input
                    type="text"
                    value={form.themeColor}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, themeColor: e.target.value.toUpperCase() }))
                    }
                    placeholder="#2563EB"
                    maxLength={7}
                    className="w-28 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Enter your super admin credentials to authorize company creation.
              </p>
              <Input
                label="Super Admin Email"
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <Input
                label="Super Admin Password"
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Enter password"
              />
            </>
          )}

          {error ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          {step === 'form' ? (
            <Button onClick={handleFormNext}>Next</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStep('form')} disabled={submitting}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Creating...' : 'Create Company'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
