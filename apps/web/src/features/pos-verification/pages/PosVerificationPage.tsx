import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSocket } from '@/shared/hooks/useSocket';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePosVerificationStore } from '@/shared/store/posVerificationStore';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { ShieldCheck } from 'lucide-react';
import { PosVerificationSkeleton } from '../components/PosVerificationSkeleton';
import { VerificationCard } from '../components/VerificationCard';

export function PosVerificationPage() {
  const { error: showErrorToast } = useAppToast();
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const branches = useBranchStore((s) => s.branches);
  const setPendingCount = usePosVerificationStore((s) => s.setPendingCount);
  const socket = useSocket('/pos-verification');
  const { user } = useAuth();

  const branchLookup = useMemo(
    () => new Map(branches.map((b) => [b.id, b])),
    [branches],
  );

  const branchLabel = useMemo(() => {
    if (branches.length === 0) return '';
    const selectedBranches = branches.filter((b) => selectedBranchIds.includes(b.id));
    if (selectedBranches.length === 0 || selectedBranches.length === branches.length) return 'All Branches';
    if (selectedBranches.length === 1) return selectedBranches[0].name;
    return `${selectedBranches[0].name} +${selectedBranches.length - 1} more`;
  }, [branches, selectedBranchIds]);

  const selectedBranchIdSet = useMemo(
    () => new Set(selectedBranchIds),
    [selectedBranchIds],
  );

  const filteredVerifications = useMemo(
    () =>
      selectedBranchIdSet.size === 0
        ? verifications
        : verifications.filter((v) => selectedBranchIdSet.has(v.branch_id)),
    [verifications, selectedBranchIdSet],
  );

  const fetchVerifications = useCallback(() => {
    if (selectedBranchIds.length === 0) return;
    if (!initialLoadDone.current) setLoading(true);
    api
      .get('/pos-verifications', { params: { branchIds: selectedBranchIds.join(',') } })
      .then((res) => {
        const data: any[] = res.data.data || [];
        setVerifications(data.filter((v) => v.status === 'pending' || v.status === 'awaiting_customer'));
      })
      .catch((err: any) => {
        showErrorToast(err?.response?.data?.error || 'Failed to load POS verifications');
      })
      .finally(() => {
        setLoading(false);
        initialLoadDone.current = true;
      });
  }, [selectedBranchIds, showErrorToast]);

  useEffect(() => {
    initialLoadDone.current = false;
    fetchVerifications();
  }, [fetchVerifications]);

  // Reset on branch change
  useEffect(() => {
    setVerifications([]);
    initialLoadDone.current = false;
  }, [selectedBranchIds]);

  // Keep sidebar badge in sync
  useEffect(() => {
    setPendingCount(filteredVerifications.length);
  }, [filteredVerifications, setPendingCount]);

  // Join branch rooms for real-time updates
  useEffect(() => {
    if (!socket || selectedBranchIds.length === 0) return;
    for (const id of selectedBranchIds) {
      socket.emit('join-branch', id);
    }
    return () => {
      for (const id of selectedBranchIds) {
        socket.emit('leave-branch', id);
      }
    };
  }, [socket, selectedBranchIds]);

  // Listen for real-time events
  useEffect(() => {
    if (!socket) return;

    socket.on('pos-verification:new', (data: any) => {
      setVerifications((prev) => [data, ...prev]);
    });

    socket.on('pos-verification:updated', (data: any) => {
      if (data.status !== 'pending' && data.status !== 'awaiting_customer') {
        setVerifications((prev) => prev.filter((v) => v.id !== data.id));
      } else {
        setVerifications((prev) => prev.map((v) => (v.id === data.id ? data : v)));
      }
    });

    socket.on('pos-verification:image-uploaded', (data: any) => {
      setVerifications((prev) =>
        prev.map((v) =>
          v.id === data.verificationId
            ? { ...v, images: [...(v.images || []), { file_name: data.fileName, file_path: data.imageUrl }] }
            : v,
        ),
      );
    });

    return () => {
      socket.off('pos-verification:new');
      socket.off('pos-verification:updated');
      socket.off('pos-verification:image-uploaded');
    };
  }, [socket]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">POS Verification</h1>
          {filteredVerifications.length > 0 && (
            <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
              {filteredVerifications.length} pending
            </span>
          )}
          {branchLabel && (
            <span className="mt-1 hidden text-sm font-medium text-primary-600 sm:inline">
              {branchLabel}
            </span>
          )}
        </div>
        {branchLabel && (
          <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
            {branchLabel}
          </p>
        )}
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Review and confirm pending point-of-sale verifications in real-time.
        </p>
      </div>

      {loading ? (
        <PosVerificationSkeleton />
      ) : filteredVerifications.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-gray-300" />
          <p className="text-sm text-gray-400">No pending verifications.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVerifications.map((v) => {
            const branch = branchLookup.get(v.branch_id);
            return (
              <VerificationCard
                key={v.id}
                verification={v}
                onUpdate={fetchVerifications}
                userId={user?.id}
                branchInfo={
                  branch
                    ? { companyName: branch.companyName, branchName: branch.name }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
