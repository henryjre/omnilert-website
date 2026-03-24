import { useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import type { Company } from './CompanyCard';

interface CompanyDeleteConfirmModalProps {
  company: Company | null;
  onClose: () => void;
  onDeleted: (companyId: string) => void;
}

export function CompanyDeleteConfirmModal({
  company,
  onClose,
  onDeleted,
}: CompanyDeleteConfirmModalProps) {
  const [confirmName, setConfirmName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  if (!company) return null;

  function handleClose() {
    if (deleting) return;
    setConfirmName('');
    setEmail('');
    setPassword('');
    setError('');
    onClose();
  }

  const canSubmit =
    confirmName.trim().toLowerCase() === company.name.trim().toLowerCase() &&
    email.trim().length > 0 &&
    password.length > 0;

  async function handleDelete() {
    if (!canSubmit || !company) return;
    setError('');
    setDeleting(true);
    try {
      // Authenticate super admin
      const authRes = await fetch('/api/v1/super/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const authData = await authRes.json();
      if (!authRes.ok || !authData.data?.accessToken) {
        setError(authData.error || 'Invalid super admin credentials.');
        return;
      }

      // Delete company
      const deleteRes = await fetch(`/api/v1/super/companies/${company.id}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authData.data.accessToken}`,
        },
        body: JSON.stringify({
          companyName: confirmName.trim(),
          superAdminEmail: email.trim(),
          superAdminPassword: password,
        }),
      });
      const deleteData = await deleteRes.json();
      if (!deleteRes.ok) {
        setError(deleteData.error || 'Failed to delete company.');
        return;
      }

      onDeleted(company.id);
      handleClose();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Delete Company Permanently</h3>
        </div>

        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-red-700">
            This will permanently delete <strong>{company.name}</strong> and all associated data.
            This cannot be undone.
          </p>

          <Input
            label={`Type company name to confirm: ${company.name}`}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={company.name}
          />
          <Input
            label="Super Admin Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label="Super Admin Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
          />

          {error ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <Button variant="secondary" onClick={handleClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting || !canSubmit}>
            {deleting ? 'Deleting...' : 'Confirm Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
