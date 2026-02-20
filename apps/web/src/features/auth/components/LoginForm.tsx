import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import axios from 'axios';
import { applyCompanyThemeFromHex } from '@/shared/utils/theme';

interface Company {
  id: string;
  name: string;
  slug: string;
  themeColor?: string;
}

type AuthMode = 'signin' | 'create-company';

export function LoginForm() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companySlug, setCompanySlug] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [odooApiKey, setOdooApiKey] = useState('');
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const fetchCompanies = async () => {
    try {
      const res = await axios.get('/api/v1/super/companies');
      const list = (res.data.data || []).map((company: any) => ({
        id: company.id,
        name: company.name,
        slug: company.slug,
        themeColor: company.themeColor ?? company.theme_color ?? undefined,
      })) as Company[];
      setCompanies(list);
      if (!companySlug && list.length === 1) {
        setCompanySlug(list[0].slug);
      }
      return list;
    } catch {
      return [] as Company[];
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (mode !== 'signin') return;
    const selected = companies.find((company) => company.slug === companySlug);
    if (selected?.themeColor) {
      applyCompanyThemeFromHex(selected.themeColor);
    }
  }, [companySlug, companies, mode]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password, companySlug);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const superAuthRes = await axios.post('/api/v1/super/auth/login', {
        email: superAdminEmail,
        password: superAdminPassword,
      });
      const superAdminToken: string = superAuthRes.data.data.accessToken;

      const createRes = await axios.post(
        '/api/v1/super/companies',
        {
          name: companyName,
          odooApiKey: odooApiKey || undefined,
        },
        {
          headers: {
            Authorization: `Bearer ${superAdminToken}`,
          },
        },
      );

      const createdCompany = createRes.data.data as Company;
      await fetchCompanies();

      try {
        await login(superAdminEmail, superAdminPassword, createdCompany.slug);
        navigate('/dashboard');
      } catch {
        setMode('signin');
        setCompanySlug(createdCompany.slug);
        setEmail(superAdminEmail);
        setPassword(superAdminPassword);
        setError('Company created, but auto-login failed. Please sign in manually.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create company');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Omnilert</h1>
          <p className="mt-2 text-sm text-gray-600">
            {mode === 'signin'
              ? 'Sign in to your account'
              : 'Create a company using Super Admin credentials'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="mb-4 grid grid-cols-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError('');
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'signin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('create-company');
                setError('');
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'create-company' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
              }`}
            >
              Create Company
            </button>
          </div>

          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label htmlFor="company" className="mb-1 block text-sm font-medium text-gray-700">
                  Company
                </label>
                <select
                  id="company"
                  value={companySlug}
                  onChange={(e) => setCompanySlug(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Select a company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                id="email"
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                id="password"
                label="Password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
              )}

              <Button type="submit" className="w-full" disabled={loading || !companySlug}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleCreateCompany} className="space-y-4">
              <Input
                id="companyName"
                label="Company Name"
                type="text"
                placeholder="Monster Siomai"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />

              <Input
                id="odooApiKey"
                label="Odoo API Key (Optional)"
                type="text"
                placeholder="Optional"
                value={odooApiKey}
                onChange={(e) => setOdooApiKey(e.target.value)}
              />

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Super Admin credentials are required to create a company.
              </div>

              <Input
                id="superAdminEmail"
                label="Super Admin Email"
                type="email"
                placeholder="owner@example.com"
                value={superAdminEmail}
                onChange={(e) => setSuperAdminEmail(e.target.value)}
                required
              />

              <Input
                id="superAdminPassword"
                label="Super Admin Password"
                type="password"
                placeholder="Enter Super Admin password"
                value={superAdminPassword}
                onChange={(e) => setSuperAdminPassword(e.target.value)}
                required
              />

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating company...' : 'Create Company'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
