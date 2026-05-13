import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { ArrowRight, CheckCircle2, KeyRound, LockKeyhole, MoveLeft, ShieldCheck } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useAuthSidebar } from '../components/AuthLayout';

const formVariants = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 340, damping: 30 } },
};

const fieldVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.055, delayChildren: 0.25 } },
};

const fieldItemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();

  useAuthSidebar(
    <>
      <div className="relative z-10 p-8">
        <div
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
        >
          <ShieldCheck className="h-3 w-3 text-amber-400" />
          Account Recovery
        </div>

        <h1 className="mt-7 text-3xl font-bold leading-tight tracking-tight text-white">
          Secure your<br />
          <span className="text-amber-400">next sign-in.</span>
        </h1>

        <p className="mt-3 max-w-[24ch] text-sm leading-relaxed text-white/55">
          Reset links are one-time access keys and expire quickly.
        </p>
      </div>

      <div className="relative z-10 p-8">
        <ul className="space-y-3">
          {[
            'Use at least 6 characters',
            'Avoid reusing old passwords',
            'Sign in again after saving',
          ].map((label) => (
            <li key={label} className="flex items-center gap-3 text-sm text-white/50">
              <CheckCircle2 className="h-4 w-4 text-amber-400/80" />
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
    [],
  );

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => navigate('/login'), 1200);
    return () => window.clearTimeout(timer);
  }, [navigate, success]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!token) {
      const message = 'Password reset link is missing or invalid.';
      setError(message);
      showErrorToast(message);
      return;
    }

    if (newPassword.length < 6) {
      const message = 'New password must be at least 6 characters.';
      setError(message);
      showErrorToast(message);
      return;
    }

    if (newPassword !== confirmPassword) {
      const message = 'New password and confirmation do not match.';
      setError(message);
      showErrorToast(message);
      return;
    }

    setLoading(true);
    try {
      await axios.post('/api/v1/auth/reset-password', {
        token,
        newPassword,
      });
      setSuccess('Password updated. Redirecting to sign in...');
      showSuccessToast('Password updated successfully.');
    } catch (err: any) {
      const message = err.response?.data?.error || 'Failed to reset password.';
      setError(message);
      showErrorToast(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div variants={fieldVariants} initial="hidden" animate="visible" className="relative z-10 flex flex-1 flex-col">
      <div className="sticky top-0 z-50 border-b border-gray-200/60 bg-white/80 px-5 py-3 shadow-sm backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold tracking-tight text-gray-900">Omnilert</span>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
          >
            <MoveLeft className="h-3.5 w-3.5" />
            Sign in
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-start px-5 py-8 sm:justify-center sm:px-10 sm:py-10 lg:px-14 lg:py-12">
        <div className="mx-auto w-full max-w-md">
          <motion.div variants={fieldItemVariants} className="mb-8 hidden lg:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">Password reset</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Choose a new password</h2>
            <p className="mt-1 text-sm text-gray-400">This one-time link expires after 10 minutes</p>
          </motion.div>

          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div id="mobile-auth-icon" className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary-600 to-primary-400 shadow-lg shadow-primary-500/30">
              <KeyRound className="h-6 w-6 text-white" />
            </div>
            <motion.div variants={fieldItemVariants}>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Reset password</h2>
              <p className="mt-2 text-sm text-gray-500">Create a new password for your account</p>
            </motion.div>
          </div>

          <motion.div variants={fieldItemVariants} className="mb-6 rounded-3xl bg-white/90 p-6 shadow-2xl shadow-primary-500/5 ring-1 ring-gray-200/50 backdrop-blur-xl sm:p-8 lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-0 lg:backdrop-blur-none">
            <AnimatePresence>
              {error ? (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  {error}
                </motion.div>
              ) : null}
              {success ? (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                >
                  {success}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {!token ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                This reset link is missing its token. Request a new password reset from the login page.
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="mt-4 inline-flex items-center gap-2 font-semibold text-amber-800 hover:text-amber-950"
                >
                  <MoveLeft className="h-4 w-4" />
                  Back to login
                </button>
              </div>
            ) : (
              <motion.form
                variants={formVariants}
                initial="hidden"
                animate="visible"
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                <Input
                  id="newPassword"
                  label="New password"
                  type="password"
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <Input
                  id="confirmPassword"
                  label="Confirm new password"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
                  After saving, existing sessions for this account will be signed out.
                </div>
                <Button type="submit" className="w-full" disabled={loading || Boolean(success)}>
                  {loading ? 'Saving password...' : 'Save new password'}
                  {!loading && <LockKeyhole className="ml-2 h-4 w-4" />}
                </Button>
              </motion.form>
            )}
          </motion.div>

          <motion.button
            variants={fieldItemVariants}
            type="button"
            onClick={() => navigate('/login')}
            className="hidden items-center gap-1.5 text-xs font-medium text-gray-400 transition-colors hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-4 lg:inline-flex"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180" />
            Back to sign in
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
