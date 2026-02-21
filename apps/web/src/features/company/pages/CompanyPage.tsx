import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { toast } from 'sonner';
import { applyCompanyThemeFromHex, DEFAULT_THEME_COLOR, isValidHexColor } from '@/shared/utils/theme';
import { useAuthStore } from '@/features/auth/store/authSlice';

const PRESET_COLORS = ['#2563EB', '#16A34A', '#DC2626', '#EA580C', '#7C3AED', '#0D9488'];
const COMPANY_CODE_RE = /^[A-Z0-9]{2,10}$/;

interface CompanyResponse {
  id: string;
  name: string;
  slug: string;
  themeColor?: string;
  companyCode?: string | null;
  canDeleteCompany?: boolean;
}

export function CompanyPage() {
  const navigate = useNavigate();
  const setCompanyThemeColor = useAuthStore((state) => state.setCompanyThemeColor);
  const clearAuth = useAuthStore((state) => state.logout);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [name, setName] = useState('');
  const [companyNameForDelete, setCompanyNameForDelete] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [themeColor, setThemeColor] = useState('#2563EB');
  const [canDeleteCompany, setCanDeleteCompany] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmCompanyName, setConfirmCompanyName] = useState('');
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');

  useEffect(() => {
    api.get('/super/companies/current')
      .then((res) => {
        const company = res.data.data as CompanyResponse;
        setName(company.name || '');
        setCompanyNameForDelete(company.name || '');
        setCompanyCode(company.companyCode ?? '');
        setCanDeleteCompany(company.canDeleteCompany === true);
        const nextTheme = company.themeColor && isValidHexColor(company.themeColor)
          ? company.themeColor.toUpperCase()
          : '#2563EB';
        setThemeColor(nextTheme);
        applyCompanyThemeFromHex(nextTheme);
        setCompanyThemeColor(nextTheme);
      })
      .catch((err) => setError(err.response?.data?.error || 'Failed to load company details'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError('');
    setSuccess('');

    if (!name.trim()) {
      setError('Company name is required');
      return;
    }

    if (!isValidHexColor(themeColor)) {
      setError('Theme color must be a valid hex color (#RRGGBB)');
      return;
    }

    if (!COMPANY_CODE_RE.test(companyCode.trim().toUpperCase())) {
      setError('Company code must be 2-10 uppercase letters/numbers');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        companyCode: companyCode.trim().toUpperCase(),
        themeColor: themeColor.toUpperCase(),
      };
      const res = await api.put('/super/companies/current', payload);
      const updated = res.data.data as CompanyResponse;
      const applied = applyCompanyThemeFromHex(updated.themeColor ?? payload.themeColor);
      setCompanyThemeColor(applied);
      setThemeColor(applied);
      if (updated.name) {
        setCompanyNameForDelete(updated.name);
      }
      setSuccess('Company settings updated successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save company settings');
    } finally {
      setSaving(false);
    }
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeleteError('');
    setConfirmCompanyName('');
    setSuperAdminEmail('');
    setSuperAdminPassword('');
  };

  const canSubmitDelete = (
    confirmCompanyName.trim().toLowerCase() === companyNameForDelete.trim().toLowerCase()
    && superAdminEmail.trim().length > 0
    && superAdminPassword.length > 0
  );

  const handleDeleteCompany = async () => {
    if (!canSubmitDelete) return;
    setDeleteError('');
    setDeleting(true);
    try {
      const res = await api.post('/super/companies/current/delete', {
        companyName: confirmCompanyName.trim(),
        superAdminEmail: superAdminEmail.trim(),
        superAdminPassword,
      });

      const warnings: string[] = Array.isArray(res.data?.data?.warnings) ? res.data.data.warnings : [];
      if (warnings.length > 0) {
        toast.warning(warnings.join(' '));
      } else {
        toast.success('Company deleted successfully.');
      }

      const defaultTheme = applyCompanyThemeFromHex(DEFAULT_THEME_COLOR);
      setCompanyThemeColor(defaultTheme);
      clearAuth();
      navigate('/login', { replace: true });
    } catch (err: any) {
      setDeleteError(err.response?.data?.error || 'Failed to delete company');
    } finally {
      setDeleting(false);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Company</h1>
        <p className="mt-1 text-sm text-gray-500">Manage company details and brand theme.</p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900">Company Settings</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            id="company-name"
            label="Company Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Company name"
          />

          <Input
            id="company-code"
            label="Company Code"
            value={companyCode}
            onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
            placeholder="e.g. FBW"
          />

          <div className="space-y-2">
            <label htmlFor="theme-color" className="block text-sm font-medium text-gray-700">
              Theme Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setThemeColor(color)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    themeColor.toUpperCase() === color ? 'border-gray-900' : 'border-white'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Select ${color} theme`}
                />
              ))}
            </div>
            <Input
              id="theme-color"
              label="Custom Hex"
              value={themeColor}
              onChange={(e) => setThemeColor(e.target.value)}
              placeholder="#2563EB"
            />
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
              <span className="text-sm text-gray-600">Preview</span>
              <span className="h-6 w-6 rounded-full border border-gray-300" style={{ backgroundColor: themeColor }} />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const applied = applyCompanyThemeFromHex(themeColor);
                  setThemeColor(applied);
                }}
              >
                Apply Preview
              </Button>
            </div>
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          {success && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>}

          <div className="flex justify-end">
            <Button variant="success" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-red-700">Danger Zone</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-red-700">
            Deleting this company will permanently remove all tenant data and cannot be undone.
          </p>
          {!canDeleteCompany ? (
            <p className="text-xs text-gray-500">
              Only the superuser account can delete this company.
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="danger"
              disabled={!canDeleteCompany}
              onClick={() => {
                setDeleteError('');
                setDeleteModalOpen(true);
              }}
            >
              Delete Company
            </Button>
          </div>
        </CardBody>
      </Card>

      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Delete Company Permanently</h3>
            <p className="mt-2 text-sm text-red-700">
              This action will delete the company database, all users, schedules, requests, sessions,
              and related tenant files. This cannot be undone.
            </p>

            <div className="mt-5 space-y-4">
              <Input
                id="confirm-company-name"
                label={`Type company name to confirm: ${companyNameForDelete}`}
                value={confirmCompanyName}
                onChange={(e) => setConfirmCompanyName(e.target.value)}
                placeholder={companyNameForDelete}
              />
              <Input
                id="delete-super-admin-email"
                label="Super Admin Email"
                type="email"
                value={superAdminEmail}
                onChange={(e) => setSuperAdminEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <Input
                id="delete-super-admin-password"
                label="Super Admin Password"
                type="password"
                value={superAdminPassword}
                onChange={(e) => setSuperAdminPassword(e.target.value)}
                placeholder="Enter password"
              />
              {deleteError ? (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{deleteError}</div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={closeDeleteModal} disabled={deleting}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteCompany}
                disabled={deleting || !canSubmitDelete}
              >
                {deleting ? 'Deleting Company...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
