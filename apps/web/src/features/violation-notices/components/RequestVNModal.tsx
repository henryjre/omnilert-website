import { useState } from 'react';
import { X, FileText } from 'lucide-react';
import type { GroupedUsersResponse } from '@omnilert/shared';
import { Button } from '@/shared/components/ui/Button';
import { requestViolationNotice } from '@/features/case-reports/services/caseReport.api';
import { createVNFromStoreAudit } from '../services/violationNotice.api';
import { GroupedUserSelect } from './GroupedUserSelect';

export interface RequestVNModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  groupedUsers: GroupedUsersResponse | null;
  loadingUsers?: boolean;
  // Source context — one of these will be provided:
  sourceCaseReportId?: string;
  sourceStoreAuditId?: string;
  sourceLabel?: string;
}

export function RequestVNModal({
  isOpen,
  onClose,
  onCreated,
  groupedUsers,
  loadingUsers = false,
  sourceCaseReportId,
  sourceStoreAuditId,
  sourceLabel,
}: RequestVNModalProps) {
  const [description, setDescription] = useState('');
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const canSubmit = description.trim().length > 0 && targetUserIds.length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      if (sourceCaseReportId) {
        await requestViolationNotice(sourceCaseReportId, {
          description: description.trim(),
          targetUserIds,
        });
      } else if (sourceStoreAuditId) {
        await createVNFromStoreAudit({
          auditId: sourceStoreAuditId,
          description: description.trim(),
          targetUserIds,
        });
      } else {
        throw new Error('No source context provided.');
      }
      onCreated();
      // Reset form
      setDescription('');
      setTargetUserIds([]);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to request violation notice.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setDescription('');
    setTargetUserIds([]);
    setError('');
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40" onClick={handleClose} />
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h3 className="text-lg font-semibold text-gray-900">Request Violation Notice</h3>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="space-y-4 px-5 py-4">
            {/* Source context badge */}
            {sourceLabel && (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">Source</p>
                  <p className="truncate text-sm text-gray-800">{sourceLabel}</p>
                </div>
              </div>
            )}

            {/* Target Employees */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Target Employees <span className="text-red-500">*</span>
              </label>
              <GroupedUserSelect
                groupedUsers={groupedUsers}
                selectedUserIds={targetUserIds}
                onChange={setTargetUserIds}
                loading={loadingUsers}
                disabled={submitting}
                placeholder="Select employees..."
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                maxLength={2000}
                disabled={submitting}
                placeholder="Describe the violation..."
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="mt-1 text-right text-xs text-gray-400">
                {description.length} / 2000
              </p>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
            <Button variant="secondary" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? 'Requesting...' : 'Request VN'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
