import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle2, KeyRound, LockKeyhole, MoveLeft } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { useAppToast } from '@/shared/hooks/useAppToast';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingToken, setCheckingToken] = useState(Boolean(token));
  const [tokenValid, setTokenValid] = useState(Boolean(token));
  const navigate = useNavigate();
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();

  useEffect(() => {
    let cancelled = false;

    async function validateToken() {
      if (!token) {
        setCheckingToken(false);
        setTokenValid(false);
        return;
      }

      setCheckingToken(true);
      try {
        await axios.post('/api/v1/auth/reset-password/validate', { token });
        if (!cancelled) {
          setTokenValid(true);
          setError('');
        }
      } catch (err: any) {
        if (!cancelled) {
          setTokenValid(false);
          setError(err.response?.data?.error || 'Password reset link is invalid or expired.');
        }
      } finally {
        if (!cancelled) {
          setCheckingToken(false);
        }
      }
    }

    void validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
    <main className="flex min-h-screen min-h-[100svh] items-center justify-center bg-gray-50 px-4 py-8 text-gray-900">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-7 flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
            {success ? <CheckCircle2 className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Omnilert</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">Reset password</h1>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Choose a new password for your account.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        {checkingToken || !token || !tokenValid ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
            {checkingToken
              ? 'Checking your reset link...'
              : 'This reset link is invalid, expired, or already used. Request a new password reset from the login page.'}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
              Reset links expire after 10 minutes. Existing sessions for this account will be signed out.
            </p>
            <Button type="submit" className="w-full" disabled={checkingToken || loading || Boolean(success)}>
              {loading ? 'Saving password...' : 'Save new password'}
              {!loading && <LockKeyhole className="ml-2 h-4 w-4" />}
            </Button>
          </form>
        )}

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-4"
        >
          <MoveLeft className="h-4 w-4" />
          Back to sign in
        </button>
      </section>
    </main>
  );
}
