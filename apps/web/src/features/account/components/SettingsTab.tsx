import { useEffect, useState } from 'react';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { api } from '@/shared/services/api.client';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const SETTINGS_ACTION_BUTTON_WIDTH = 'w-52 justify-center';

export function SettingsTab() {
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [email, setEmail] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    api
      .get('/users/me')
      .then((res) => {
        setEmail(res.data.data?.email || '');
      })
      .finally(() => setLoading(false));
  }, []);

  const validatePasswordForm = (): boolean => {
    setSuccessMessage('');
    setErrorMessage('');

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setErrorMessage('Please fill out all password fields.');
      return false;
    }
    if (passwordForm.newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters.');
      return false;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setErrorMessage('New password and confirmation do not match.');
      return false;
    }
    if (!refreshToken) {
      setErrorMessage('Session token missing. Please log in again.');
      return false;
    }
    return true;
  };

  const handleSaveEmail = async () => {
    setSuccessMessage('');
    setErrorMessage('');
    setSavingEmail(true);
    try {
      const res = await api.patch('/account/email', { email: email.trim() });
      const nextEmail = res.data.data?.email || email.trim();
      setEmail(nextEmail);
      updateUser({ email: nextEmail });
      setSuccessMessage('Email updated successfully.');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      setErrorMessage(error.response?.data?.error || error.response?.data?.message || 'Failed to update email');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async () => {
    if (!validatePasswordForm() || !refreshToken) return;

    setChangingPassword(true);
    try {
      await api.post('/users/me/password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        currentRefreshToken: refreshToken,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccessMessage('Password changed successfully.');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      setErrorMessage(error.response?.data?.error || error.response?.data?.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <div className="animate-pulse space-y-4">
            <div className="mx-auto h-4 w-32 rounded bg-gray-200" />
            <div className="mx-auto h-4 w-48 rounded bg-gray-200" />
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-6">
        {successMessage && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" />
            {errorMessage}
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Email Address</h3>
          <p className="text-xs text-gray-500">Email changes are saved immediately.</p>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
            />
          </div>
          <div className="flex justify-center sm:justify-end">
            <Button
              type="button"
              onClick={handleSaveEmail}
              disabled={savingEmail}
              className={SETTINGS_ACTION_BUTTON_WIDTH}
            >
              {savingEmail ? 'Saving...' : 'Save Email'}
            </Button>
          </div>
        </div>

        <div className="space-y-4 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-900">Change Password</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Current Password</label>
              <Input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
                placeholder="Enter current password"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">New Password</label>
              <Input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Confirm New Password</label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Re-enter new password"
              />
            </div>
          </div>
          <div className="flex justify-center sm:justify-end">
            <Button
              type="button"
              variant="standard"
              onClick={() => {
                if (!validatePasswordForm()) return;
                setPasswordConfirmOpen(true);
              }}
              disabled={changingPassword}
              className={SETTINGS_ACTION_BUTTON_WIDTH}
            >
              {changingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </div>

        {passwordConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
              <div className="border-b border-gray-200 px-5 py-4">
                <p className="font-semibold text-gray-900">Confirm Password Change</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-gray-700">
                  Changing your password will log you out of all other sessions except your current session.
                  Do you want to continue?
                </p>
              </div>
              <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
                <Button
                  type="button"
                  className="flex-1"
                  variant="standard"
                  disabled={changingPassword}
                  onClick={async () => {
                    setPasswordConfirmOpen(false);
                    await handleChangePassword();
                  }}
                >
                  {changingPassword ? 'Changing...' : 'Yes, Change Password'}
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  variant="secondary"
                  disabled={changingPassword}
                  onClick={() => setPasswordConfirmOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
