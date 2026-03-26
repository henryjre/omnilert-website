import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { api } from '@/shared/services/api.client';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { Bell, Lock, Mail, Settings as SettingsIcon, Sun, Moon, Monitor, Palette } from 'lucide-react';
import {
  getExistingPushSubscription,
  isPushSupported,
  requestNotificationPermission,
  subscribeToPush,
} from '@/shared/services/push.client';
import { useThemeMode } from '@/shared/hooks/useThemeMode';

const SETTINGS_ACTION_BUTTON_WIDTH = 'w-52 justify-center';

export function SettingsTab() {
  const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [updatingPush, setUpdatingPush] = useState(false);
  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [email, setEmail] = useState('');
  const [pushSupported, setPushSupported] = useState(false);
  const [pushBackendEnabled, setPushBackendEnabled] = useState(false);
  const [pushVapidPublicKey, setPushVapidPublicKey] = useState('');
  const [pushPreferenceEnabled, setPushPreferenceEnabled] = useState(false);
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

    setPushSupported(isPushSupported());

    api
      .get('/account/push/config')
      .then((res) => {
        setPushBackendEnabled(Boolean(res.data.data?.enabled));
        setPushVapidPublicKey(res.data.data?.vapidPublicKey || '');
      })
      .catch(() => {
        setPushBackendEnabled(false);
        setPushVapidPublicKey('');
      });

    api
      .get('/account/push/preferences')
      .then((res) => {
        setPushPreferenceEnabled(Boolean(res.data.data?.enabled));
      })
      .catch(() => {
        setPushPreferenceEnabled(false);
      });
  }, []);

  const validatePasswordForm = (): boolean => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      showErrorToast('Please fill out all password fields.');
      return false;
    }
    if (passwordForm.newPassword.length < 6) {
      showErrorToast('New password must be at least 6 characters.');
      return false;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showErrorToast('New password and confirmation do not match.');
      return false;
    }
    if (!refreshToken) {
      showErrorToast('Session token missing. Please log in again.');
      return false;
    }
    return true;
  };

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    try {
      const res = await api.patch('/account/email', { email: email.trim() });
      const nextEmail = res.data.data?.email || email.trim();
      setEmail(nextEmail);
      updateUser({ email: nextEmail });
      showSuccessToast('Email updated successfully.');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      showErrorToast(error.response?.data?.error || error.response?.data?.message || 'Failed to update email');
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
      showSuccessToast('Password changed successfully.');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      showErrorToast(error.response?.data?.error || error.response?.data?.message || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleEnableDeviceNotifications = async () => {
    if (!pushBackendEnabled) {
      showErrorToast('Device notifications are not enabled by your company configuration.');
      return;
    }
    if (!pushSupported) {
      showErrorToast('This browser does not support device push notifications.');
      return;
    }
    if (!pushVapidPublicKey) {
      showErrorToast('Push configuration is incomplete. Please contact your administrator.');
      return;
    }

    setUpdatingPush(true);
    try {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        showErrorToast('Browser notification permission was denied.');
        return;
      }

      const subscription = await subscribeToPush(pushVapidPublicKey);
      if (!subscription) {
        showErrorToast('Failed to subscribe this device for notifications.');
        return;
      }

      const payload = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!payload.endpoint || !payload.keys?.p256dh || !payload.keys?.auth) {
        showErrorToast('Push subscription data is incomplete.');
        return;
      }

      await api.post('/account/push/subscriptions', {
        endpoint: payload.endpoint,
        keys: {
          p256dh: payload.keys.p256dh,
          auth: payload.keys.auth,
        },
        userAgent: navigator.userAgent,
      });
      await api.patch('/account/push/preferences', { enabled: true });
      setPushPreferenceEnabled(true);
      showSuccessToast('Device notifications enabled.');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      showErrorToast(error.response?.data?.error || error.response?.data?.message || 'Failed to enable device notifications');
    } finally {
      setUpdatingPush(false);
    }
  };

  const handleDisableDeviceNotifications = async () => {
    setUpdatingPush(true);
    try {
      const existing = await getExistingPushSubscription();
      if (existing) {
        const payload = existing.toJSON() as { endpoint?: string };
        if (payload.endpoint) {
          await api.delete('/account/push/subscriptions', {
            data: { endpoint: payload.endpoint },
          });
        }
        await existing.unsubscribe();
      }

      await api.patch('/account/push/preferences', { enabled: false });
      setPushPreferenceEnabled(false);
      showSuccessToast('Device notifications disabled.');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      showErrorToast(error.response?.data?.error || error.response?.data?.message || 'Failed to disable device notifications');
    } finally {
      setUpdatingPush(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      {/* ─── Page header ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Settings</h1>
        </div>
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Manage your account preferences, security, and notifications.
        </p>
      </div>

      {/* ─── Appearance ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Appearance</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Choose how Omnilert looks on this device. System follows your OS preference.
          </p>
        </CardHeader>
        <CardBody>
          <div className="flex w-fit gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {(
              [
                { value: 'system', label: 'System', Icon: Monitor },
                { value: 'light', label: 'Light', Icon: Sun },
                { value: 'dark', label: 'Dark', Icon: Moon },
              ] as const
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setThemeMode(value)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  themeMode === value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ─── Email address ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Email Address</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Your login and notification email. Changes take effect immediately.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSaveEmail}
              disabled={savingEmail}
            >
              {savingEmail ? 'Saving...' : 'Save Email'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ─── Security ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Security</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Change your password. You will be signed out of all other sessions after a password change.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
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
          <div className="flex justify-end">
            <Button
              type="button"
              variant="standard"
              onClick={() => {
                if (!validatePasswordForm()) return;
                setPasswordConfirmOpen(true);
              }}
              disabled={changingPassword}
            >
              {changingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ─── Device notifications ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-gray-900">Device Notifications</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Receive browser push notifications even when you are offline or the tab is closed.
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          {!pushBackendEnabled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              Device notifications are currently disabled by server configuration.
            </div>
          )}
          {!pushSupported && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              Your current browser does not support push notifications.
            </div>
          )}
          <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">
                {pushPreferenceEnabled ? 'Notifications are enabled' : 'Notifications are disabled'}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {pushPreferenceEnabled
                  ? 'You will receive push alerts on this device.'
                  : 'Enable to receive alerts directly on this device.'}
              </p>
            </div>
            {pushPreferenceEnabled ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleDisableDeviceNotifications}
                disabled={updatingPush}
              >
                {updatingPush ? 'Updating...' : 'Disable'}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={handleEnableDeviceNotifications}
                disabled={updatingPush || !pushBackendEnabled || !pushSupported}
              >
                {updatingPush ? 'Updating...' : 'Enable'}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ─── Password confirm dialog ──────────────────────────────────── */}
      {passwordConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">Confirm Password Change</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">
                Changing your password will sign you out of all other active sessions. Your current
                session will stay open. Do you want to continue?
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
    </div>
  );
}
