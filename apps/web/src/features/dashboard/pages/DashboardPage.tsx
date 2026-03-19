import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';
import { EpiDashboard } from '../components/epi/EpiDashboard';
import { DashboardPageSkeleton } from '../components/epi/EpiSkeletons';
import { fetchEpiDashboard, fetchEpiLeaderboardSummary, getCurrentManilaMonthKey } from '../services/epi.api';

export function DashboardPage() {
  const { hasPermission } = usePermission();
  const user = useAuthStore((s) => s.user);
  const canViewPerformanceIndex = hasPermission(PERMISSIONS.DASHBOARD_VIEW_PERFORMANCE_INDEX);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => getCurrentManilaMonthKey());

  const dashboardQuery = useQuery({
    queryKey: ['epi-dashboard'],
    queryFn: fetchEpiDashboard,
    enabled: canViewPerformanceIndex,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  useEffect(() => {
    if (!dashboardQuery.data) return;

    const fallbackMonthKey =
      dashboardQuery.data.history[dashboardQuery.data.history.length - 1]?.monthKey ??
      dashboardQuery.data.currentMonthKey;

    if (!dashboardQuery.data.history.some((entry) => entry.monthKey === selectedMonthKey)) {
      setSelectedMonthKey(dashboardQuery.data.currentMonthKey || fallbackMonthKey);
    }
  }, [dashboardQuery.data, selectedMonthKey]);

  const leaderboardSummaryQuery = useQuery({
    queryKey: ['epi-leaderboard-summary', selectedMonthKey],
    queryFn: () => fetchEpiLeaderboardSummary(selectedMonthKey),
    enabled: canViewPerformanceIndex && Boolean(selectedMonthKey),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return (
    <div className="space-y-6">
      {canViewPerformanceIndex && (
        <>
          {dashboardQuery.isPending && !dashboardQuery.data && <DashboardPageSkeleton />}
          {dashboardQuery.error && !dashboardQuery.data && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              Failed to load EPI data.
            </div>
          )}
          {dashboardQuery.data && (
            <EpiDashboard
              data={dashboardQuery.data}
              leaderboard={leaderboardSummaryQuery.data ?? []}
              leaderboardLoading={leaderboardSummaryQuery.isPending}
              leaderboardError={leaderboardSummaryQuery.error ? 'Failed to load leaderboard.' : null}
              firstName={user?.firstName || 'User'}
              selectedMonthKey={selectedMonthKey}
              onSelectMonth={setSelectedMonthKey}
            />
          )}
        </>
      )}
    </div>
  );
}
