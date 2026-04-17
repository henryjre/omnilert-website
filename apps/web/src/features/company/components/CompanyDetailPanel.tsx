import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { api } from '@/shared/services/api.client';
import { isValidHexColor } from '@/shared/utils/theme';
import { useAppToast } from '@/shared/hooks/useAppToast';
import type { Company } from './CompanyCard';
import { BranchSection } from './BranchSection';
import { CompanyAvatar } from './CompanyAvatar';
import { Spinner } from '@/shared/components/ui/Spinner';

const PRESET_COLORS = ['#2563EB', '#16A34A', '#DC2626', '#EA580C', '#7C3AED', '#0D9488'];
const COMPANY_CODE_RE = /^[A-Z0-9]{2,10}$/;

interface CompanyDetailPanelProps {
  company: Company | null;
  onClose: () => void;
  onSaved: (updated: Company) => void;
  onDeleteRequest: (company: Company) => void;
}

export function CompanyDetailPanel({
  company,
  onClose,
  onSaved,
  onDeleteRequest,
}: CompanyDetailPanelProps) {
  const { success: showSuccess, error: showError } = useAppToast();

  const [name, setName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [odooApiKey, setOdooApiKey] = useState('');
  const [themeColor, setThemeColor] = useState('#2563EB');
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (company) {
      setName(company.name);
      setCompanyCode(company.companyCode ?? '');
      setOdooApiKey(company.odooApiKey ?? '');
      setThemeColor(company.themeColor);
      setLogoUrl(company.logoUrl ?? null);
    }
  }, [company]);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !company) return;

    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const res = await api.post(`/super/companies/${company.id}/logo`, formData);
      const updated = res.data.data as Company;
      setLogoUrl(updated.logoUrl ?? null);
      onSaved(updated);
      showSuccess('Logo updated.');
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to upload logo.');
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  async function handleSave() {
    if (!company) return;

    if (!name.trim()) {
      showError('Company name is required.');
      return;
    }
    if (companyCode && !COMPANY_CODE_RE.test(companyCode.trim().toUpperCase())) {
      showError('Company code must be 2-10 uppercase letters/numbers.');
      return;
    }
    if (!isValidHexColor(themeColor)) {
      showError('Theme color must be a valid hex color.');
      return;
    }

    setSaving(true);
    try {
      const res = await api.put(`/super/companies/${company.id}/update`, {
        name: name.trim(),
        companyCode: companyCode.trim().toUpperCase() || undefined,
        odooApiKey: odooApiKey.trim() || undefined,
        themeColor: themeColor.toUpperCase(),
      });
      const updated = res.data.data as Company;
      showSuccess('Company updated successfully.');
      onSaved(updated);
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to update company.');
    } finally {
      setSaving(false);
    }
  }

  const isOpen = company !== null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={onClose}
        />
      )}

      {/* Side panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col bg-white shadow-2xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {company?.name ?? ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {/* Logo */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Company Logo</label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <CompanyAvatar
                    name={name || company?.name || '?'}
                    logoUrl={logoUrl}
                    themeColor={isValidHexColor(themeColor) ? themeColor : '#2563EB'}
                    size={80}
                    className="rounded-xl"
                  />
                  {logoUploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
                      <Spinner size="sm" />
                    </div>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {logoUrl ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  <p className="mt-1 text-xs text-gray-400">JPEG, PNG, WebP or GIF · max 5 MB</p>
                </div>
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>

            <Input
              id="edit-company-name"
              label="Company Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company name"
            />
            <Input
              id="edit-company-code"
              label="Company Code"
              value={companyCode}
              onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
              placeholder="e.g. FBW"
              maxLength={10}
            />
            <Input
              id="edit-odoo-api-key"
              label="Odoo API Key (optional)"
              value={odooApiKey}
              onChange={(e) => setOdooApiKey(e.target.value)}
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
                    onClick={() => setThemeColor(color)}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      themeColor.toUpperCase() === color
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
                  value={isValidHexColor(themeColor) ? themeColor : '#2563EB'}
                  onChange={(e) => setThemeColor(e.target.value.toUpperCase())}
                  className="h-9 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                />
                <input
                  type="text"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value.toUpperCase())}
                  placeholder="#2563EB"
                  maxLength={7}
                  className="w-28 rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="success" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>

          {/* Branch management */}
          {company && (
            <div className="mt-8 border-t border-gray-200 pt-6">
              <BranchSection companyId={company.id} />
            </div>
          )}

          {/* Danger zone */}
          {company && (
            <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-semibold text-red-700">Danger Zone</h3>
              <p className="mt-1 text-xs text-red-600">
                Deleting this company will permanently remove all data and cannot be undone.
              </p>
              <div className="mt-3 flex justify-end">
                <Button
                  variant="danger"
                  onClick={() => onDeleteRequest(company)}
                >
                  Delete Company
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
