import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { applyCompanyThemeFromHex, isValidHexColor } from '@/shared/utils/theme';
import { useAuthStore } from '@/features/auth/store/authSlice';

const PRESET_COLORS = ['#2563EB', '#16A34A', '#DC2626', '#EA580C', '#7C3AED', '#0D9488'];

interface CompanyResponse {
  id: string;
  name: string;
  slug: string;
  themeColor?: string;
}

export function CompanyPage() {
  const setCompanyThemeColor = useAuthStore((state) => state.setCompanyThemeColor);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [name, setName] = useState('');
  const [themeColor, setThemeColor] = useState('#2563EB');

  useEffect(() => {
    api.get('/super/companies/current')
      .then((res) => {
        const company = res.data.data as CompanyResponse;
        setName(company.name || '');
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

    setSaving(true);
    try {
      const payload = { name: name.trim(), themeColor: themeColor.toUpperCase() };
      const res = await api.put('/super/companies/current', payload);
      const updated = res.data.data as CompanyResponse;
      const applied = applyCompanyThemeFromHex(updated.themeColor ?? payload.themeColor);
      setCompanyThemeColor(applied);
      setThemeColor(applied);
      setSuccess('Company settings updated successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save company settings');
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
    </div>
  );
}
