import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSocket } from '@/shared/hooks/useSocket';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePosVerificationStore } from '@/shared/store/posVerificationStore';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { ShieldCheck } from 'lucide-react';
import { useLiveDashboardCheckInStatus } from '@/features/dashboard/hooks/useLiveDashboardCheckInStatus';
import { PosVerificationSkeleton } from '../components/PosVerificationSkeleton';
import { PosVerificationBranchPicker } from '../components/PosVerificationBranchPicker';
import { VerificationCard } from '../components/VerificationCard';

export function PosVerificationPage() {
  const { error: showErrorToast } = useAppToast();
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageBranchId, setPageBranchId] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const branches = useBranchStore((s) => s.branches);
  const companyBranchGroups = useBranchStore((s) => s.companyBranchGroups);
  const setPendingCount = usePosVerificationStore((s) => s.setPendingCount);
  const socket = useSocket('/pos-verification');
  const { user } = useAuth();
  const checkInStatusQuery = useLiveDashboardCheckInStatus({
    queryConfig: {
      staleTime: 60_000,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchInterval: 300_000,
      refetchIntervalInBackground: false,
    },
  });
  const checkInStatus = checkInStatusQuery.data;

  const branchLookup = useMemo(
    () => new Map(branches.map((b) => [b.id, b])),
    [branches],
  );

  const selectedBranchIdSet = useMemo(
    () => new Set(selectedBranchIds),
    [selectedBranchIds],
  );

  const eligibleBranches = useMemo(
    () =>
      branches.filter(
        (branch) => selectedBranchIdSet.has(branch.id) && branch.is_main_branch !== true,
      ),
    [branches, selectedBranchIdSet],
  );

  const eligibleBranchIdSet = useMemo(
    () => new Set(eligibleBranches.map((branch) => branch.id)),
    [eligibleBranches],
  );

  const isCheckInStatusResolved = checkInStatusQuery.isSuccess || checkInStatusQuery.isError;
  const isLockedToCheckedInBranch = Boolean(
    checkInStatus?.checkedIn && checkInStatus.branchId && checkInStatus.branchOdooId !== '1',
  );

  useEffect(() => {
    if (isLockedToCheckedInBranch) return;

    if (eligibleBranches.length === 0) {
      setPageBranchId(null);
      return;
    }

    setPageBranchId((current) => {
      if (current && eligibleBranchIdSet.has(current)) {
        return current;
      }

      return eligibleBranches[0]?.id ?? null;
    });
  }, [eligibleBranchIdSet, eligibleBranches, isLockedToCheckedInBranch]);

  const effectiveBranchId = isLockedToCheckedInBranch
    ? checkInStatus?.branchId ?? null
    : pageBranchId;

  const effectiveBranch = useMemo(
    () => (effectiveBranchId ? branchLookup.get(effectiveBranchId) ?? null : null),
    [branchLookup, effectiveBranchId],
  );

  const effectiveBranchLabel = useMemo(() => {
    if (effectiveBranch?.name) return effectiveBranch.name;
    if (isLockedToCheckedInBranch && checkInStatus?.branchName) return checkInStatus.branchName;
    return eligibleBranches[0]?.name ?? 'Select branch';
  }, [checkInStatus?.branchName, effectiveBranch, eligibleBranches, isLockedToCheckedInBranch]);

  const fetchVerifications = useCallback(() => {
    if (!isCheckInStatusResolved) return;

    if (!effectiveBranchId) {
      setVerifications([]);
      setLoading(false);
      initialLoadDone.current = true;
      return;
    }

    if (!initialLoadDone.current) setLoading(true);
    api
      .get('/pos-verifications', { params: { branchId: effectiveBranchId } })
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
  }, [effectiveBranchId, isCheckInStatusResolved, showErrorToast]);

  useEffect(() => {
    initialLoadDone.current = false;
    fetchVerifications();
  }, [fetchVerifications]);

  // Reset on page branch change
  useEffect(() => {
    setVerifications([]);
    initialLoadDone.current = false;
  }, [effectiveBranchId]);

  // Keep sidebar badge in sync
  useEffect(() => {
    setPendingCount(verifications.length);
  }, [setPendingCount, verifications.length]);

  // Join branch rooms for real-time updates
  useEffect(() => {
    if (!socket || !effectiveBranchId) return;

    socket.emit('join-branch', effectiveBranchId);

    return () => {
      socket.emit('leave-branch', effectiveBranchId);
    };
  }, [effectiveBranchId, socket]);

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

  const showNoEligibleBranchesState =
    isCheckInStatusResolved && !loading && !isLockedToCheckedInBranch && eligibleBranches.length === 0;
  const showLoadingState = !isCheckInStatusResolved || loading;

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">POS Verification</h1>
            {verifications.length > 0 && (
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                {verifications.length} pending
              </span>
            )}
          </div>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            Review and confirm pending point-of-sale verifications in real-time.
          </p>
        </div>

        <div className="mx-auto w-fit shrink-0 lg:mx-0">
          <PosVerificationBranchPicker
            companyBranchGroups={companyBranchGroups}
            currentBranch={effectiveBranch}
            currentLabel={effectiveBranchLabel}
            options={eligibleBranches}
            locked={isLockedToCheckedInBranch}
            disabled={eligibleBranches.length === 0}
            onSelect={setPageBranchId}
          />
        </div>
      </div>

      {showLoadingState ? (
        <PosVerificationSkeleton />
      ) : showNoEligibleBranchesState ? (
        <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/80 px-4 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-900">No eligible POS verification branch selected.</p>
              <p className="mt-1 text-sm text-amber-700">
                Select at least one non-main branch from the global branch selector to review verifications here.
              </p>
            </div>
          </div>
        </div>
      ) : verifications.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-gray-300" />
          <p className="text-sm text-gray-400">No pending verifications.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {verifications.map((v) => {
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
