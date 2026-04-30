import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { ArrowRight, Building2, LogIn, MoveLeft, UserRoundPlus } from 'lucide-react';
import { useAuthSidebar } from './AuthLayout';
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

const formVariants = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 340, damping: 30 } },
  exit: { opacity: 0, x: -12 },
};

const fieldVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.4 } },
};

const fieldItemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};

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

  useAuthSidebar(
    <>
      <div className="relative z-10 p-8">
        <div
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <LogIn className="h-3 w-3 text-amber-400" />
          Log In
        </div>

        <h1 className="mt-7 text-3xl font-bold leading-tight tracking-tight text-white">
          Good to see<br />
          <span className="text-amber-400">you again.</span>
        </h1>

        <p className="mt-3 max-w-[22ch] text-sm leading-relaxed text-white/55">
          Sign in to access your dashboard, shifts, and team tools.
        </p>
      </div>

      <div className="relative z-10 p-8">
        <ul className="space-y-3">
          {[
            { icon: '📋', label: 'View your shifts & schedule' },
            { icon: '💬', label: 'Team announcements & alerts' },
            { icon: '📊', label: 'HR reports & analytics' },
          ].map(({ icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-white/50">
              <span className="text-base">{icon}</span>
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex items-center gap-2">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Omnilert</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>
      </div>
    </>,
    []
  );

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
    <motion.div variants={fieldVariants} initial="hidden" animate="visible" className="flex flex-col flex-1 relative z-10">
      <div className="sticky top-0 z-50 border-b border-gray-200/60 bg-white/80 px-5 py-3 backdrop-blur-md lg:hidden shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-tight text-gray-900">Omnilert</span>
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            <UserRoundPlus className="h-3.5 w-3.5" />
            Register
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-start px-5 py-8 sm:justify-center sm:px-10 sm:py-10 lg:px-14 lg:py-12">
        <div className="mx-auto w-full max-w-md">

          {/* Desktop header */}
          <motion.div variants={fieldItemVariants} className="mb-8 hidden lg:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">
              {mode === 'signin' ? 'Welcome back' : 'Setup'}
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">
              {mode === 'signin' ? 'Sign in to your account' : 'Create a new company'}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {mode === 'signin'
                ? 'Enter your credentials to continue'
                : 'Super Admin credentials required'}
            </p>
          </motion.div>

          {/* Mobile header */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div id="mobile-auth-icon" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary-600 to-primary-400 shadow-lg shadow-primary-500/30">
              {mode === 'signin' ? <LogIn className="h-6 w-6 text-white" /> : <Building2 className="h-6 w-6 text-white" />}
            </div>
            <motion.div variants={fieldItemVariants}>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">
                {mode === 'signin' ? 'Welcome back' : 'Create company'}
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                {mode === 'signin' ? 'Sign in to access your dashboard' : 'Super Admin credentials required'}
              </p>
            </motion.div>
          </div>

          {/* Tab switcher — only shown when no companies exist */}
          {hasCompanies === false && (
            <motion.div variants={fieldItemVariants} className="mb-6 grid grid-cols-2 rounded-lg bg-gray-100/80 p-1">
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(''); }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'signin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('create-company'); setError(''); }}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${mode === 'create-company' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                Create Company
              </button>
            </motion.div>
          )}

          {/* Form section */}
          <motion.div variants={fieldItemVariants} className="rounded-3xl bg-white/90 p-6 shadow-2xl shadow-primary-500/5 ring-1 ring-gray-200/50 backdrop-blur-xl sm:p-8 mb-6 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0 lg:backdrop-blur-none lg:mb-0">
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

            {/* Forms */}
            <AnimatePresence mode="wait">
              {mode === 'signin' ? (
                <motion.form
                  key="signin"
                  variants={formVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  onSubmit={handleSignIn}
                >
                  <motion.div variants={fieldVariants} initial="hidden" animate="visible" className="space-y-4">
                    <motion.div variants={fieldItemVariants}>
                      <Input
                        id="email"
                        label="Email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </motion.div>

                    <motion.div variants={fieldItemVariants}>
                      <Input
                        id="password"
                        label="Password"
                        type="password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </motion.div>

                    <motion.div variants={fieldItemVariants} className="pt-1">
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Signing in…' : 'Sign In'}
                        {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                      </Button>
                    </motion.div>

                    <motion.div variants={fieldItemVariants}>
                      <button
                        type="button"
                        onClick={() => navigate('/register')}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                      >
                        <UserRoundPlus className="h-4 w-4" />
                        Go to Registration
                      </button>
                    </motion.div>
                  </motion.div>
                </motion.form>
              ) : mode === 'create-company' && !hasCompanies ? (
                <motion.form
                  key="create-company"
                  variants={formVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  onSubmit={handleCreateCompany}
                >
                  <motion.div variants={fieldVariants} initial="hidden" animate="visible" className="space-y-4">
                    <motion.div variants={fieldItemVariants}>
                      <Input
                        id="companyName"
                        label="Company Name"
                        type="text"
                        placeholder="Monster Siomai"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                      />
                    </motion.div>

                    <motion.div variants={fieldItemVariants}>
                      <Input
                        id="companyCode"
                        label="Company Code (Optional)"
                        type="text"
                        placeholder="e.g. FBW, OMNI01"
                        value={companyCode}
                        onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                        maxLength={10}
                      />
                    </motion.div>

                    <motion.div variants={fieldItemVariants}>
                      <Input
                        id="odooApiKey"
                        label="Odoo API Key (Optional)"
                        type="text"
                        placeholder="Optional"
                        value={odooApiKey}
                        onChange={(e) => setOdooApiKey(e.target.value)}
                      />
                    </motion.div>

                    <motion.div variants={fieldItemVariants}>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                          <p className="text-xs font-medium text-amber-800">
                            Super Admin credentials are required to create a company.
                          </p>
                        </div>
                      </div>
                    </motion.div>

                    <motion.div variants={fieldItemVariants}>
                      <Input
                        id="superAdminEmail"
                        label="Super Admin Email"
                        type="email"
                        placeholder="owner@example.com"
                        value={superAdminEmail}
                        onChange={(e) => setSuperAdminEmail(e.target.value)}
                        required
                      />
                    </motion.div>

                    <motion.div variants={fieldItemVariants}>
                      <Input
                        id="superAdminPassword"
                        label="Super Admin Password"
                        type="password"
                        placeholder="Enter Super Admin password"
                        value={superAdminPassword}
                        onChange={(e) => setSuperAdminPassword(e.target.value)}
                        required
                      />
                    </motion.div>

                    <motion.div variants={fieldItemVariants} className="pt-1">
                      <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Creating company…' : 'Create Company'}
                        {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                      </Button>
                    </motion.div>
                  </motion.div>
                </motion.form>
              ) : null}
            </AnimatePresence>

            {/* Discord back link */}
            {discordSourceUrl && (
              <div className="mt-6 flex justify-center">
                <a
                  href={discordSourceUrl}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-4"
                >
                  <MoveLeft className="h-3.5 w-[18px]" aria-hidden="true" />
                  Back to Discord
                </a>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
