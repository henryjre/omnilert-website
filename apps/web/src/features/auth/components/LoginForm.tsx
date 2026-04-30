import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { MoveLeft, UserRoundPlus } from 'lucide-react';
import axios from 'axios';

interface Company {
  id: string;
  name: string;
  slug: string;
  themeColor?: string;
}

type AuthMode = 'signin' | 'create-company';

function sanitizeRedirectPath(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (!raw.startsWith('/')) return '/dashboard';
  if (raw.startsWith('//')) return '/dashboard';
  return raw;
}

function getSafeDiscordSourceUrl(rawSource: string | null, guildId: string | undefined): string | null {
  if (!rawSource || !guildId) return null;

  try {
    const url = new URL(rawSource);
    const hostname = url.hostname.toLowerCase();
    const protocol = url.protocol.toLowerCase();
    const isDiscordHost =
      protocol === 'discord:' ||
      hostname === 'discord.com' ||
      hostname.endsWith('.discord.com') ||
      hostname === 'discordapp.com' ||
      hostname.endsWith('.discordapp.com');

    if (!isDiscordHost) return null;
    if (!rawSource.includes(guildId)) return null;

    return rawSource;
  } catch {
    return null;
  }
}

export function LoginForm() {
  const [searchParams] = useSearchParams();
  const redirectPath = sanitizeRedirectPath(searchParams.get('redirect'));
  const discordSourceUrl = getSafeDiscordSourceUrl(
    searchParams.get('source'),
    import.meta.env.VITE_DISCORD_GUILD_ID,
  );
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [odooApiKey, setOdooApiKey] = useState('');
  const [superAdminEmail, setSuperAdminEmail] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasCompanies, setHasCompanies] = useState<boolean | null>(null);
  const { login } = useAuth();

  useEffect(() => {
    fetch('/api/v1/super/companies')
      .then((r) => r.json())
      .then((data) => {
        const exists = Array.isArray(data.data) && data.data.length > 0;
        setHasCompanies(exists);
        if (exists) {
          setMode((prev) => (prev === 'create-company' ? 'signin' : prev));
        }
      })
      .catch(() => {
        // If the "company existence" check fails, keep Create Company hidden by default.
        // It should only be shown when we can confirm there are no companies in the DB.
        setHasCompanies(null);
      });
  }, []);
  const navigate = useNavigate();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate(redirectPath);
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
          companyCode: companyCode.trim().toUpperCase() || undefined,
          odooApiKey: odooApiKey || undefined,
        },
        {
          headers: {
            Authorization: `Bearer ${superAdminToken}`,
          },
        },
      );

      const createdCompany = createRes.data.data as Company;

      try {
        await login(superAdminEmail, superAdminPassword, createdCompany.slug);
        navigate('/dashboard');
      } catch {
        setMode('signin');
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
          <div className={`mb-4 grid ${hasCompanies === false ? 'grid-cols-2' : 'grid-cols-1'} rounded-lg bg-gray-100 p-1`}>
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
            {hasCompanies === false && (
              <button
                type="button"
                onClick={() => {
                  setMode('create-company');
                  setError('');
                }}
                className={`rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  mode === 'create-company' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                Create Company
              </button>
            )}
          </div>

          {mode === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
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

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
              >
                <UserRoundPlus className="h-4 w-4" />
                Go to Registration
              </button>
            </form>
          ) : mode === 'create-company' && !hasCompanies ? (
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
                id="companyCode"
                label="Company Code (Optional)"
                type="text"
                placeholder="e.g. FBW, OMNI01"
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                maxLength={10}
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
          ) : null}
        </div>

        {discordSourceUrl && (
          <div className="mt-4 flex justify-center">
            <a
              href={discordSourceUrl}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 transition-colors hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-4"
            >
              <MoveLeft className="h-3.5 w-[18px]" aria-hidden="true" />
              Back to Discord
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
