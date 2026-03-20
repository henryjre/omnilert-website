import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { Button } from '@/shared/components/ui/Button';
import { PERMISSIONS } from '@omnilert/shared';
import { EpiDashboard } from '../components/epi/EpiDashboard';
import { DashboardPageSkeleton } from '../components/epi/EpiSkeletons';
import { fetchEpiDashboard, fetchEpiLeaderboardSummary, getCurrentManilaMonthKey } from '../services/epi.api';
import { getDashboardRefreshPolicy } from '../services/dashboardRefreshPolicy';

export function DashboardPage() {
  const { hasPermission } = usePermission();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { error: showErrorToast } = useAppToast();
  const canViewPerformanceIndex = hasPermission(PERMISSIONS.DASHBOARD_VIEW_PERFORMANCE_INDEX);
  const [currentMonthKey, setCurrentMonthKey] = useState(() => getCurrentManilaMonthKey());
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const refreshPolicy = useMemo(
    () => getDashboardRefreshPolicy({ selectedMonthKey, currentMonthKey }),
    [currentMonthKey, selectedMonthKey],
  );

  const dashboardQuery = useQuery({
    queryKey: ['epi-dashboard'],
    queryFn: fetchEpiDashboard,
    enabled: canViewPerformanceIndex,
    ...refreshPolicy,
    gcTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!dashboardQuery.data?.currentMonthKey) return;
    if (dashboardQuery.data.currentMonthKey === currentMonthKey) return;
    setCurrentMonthKey(dashboardQuery.data.currentMonthKey);
  }, [currentMonthKey, dashboardQuery.data?.currentMonthKey]);

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
    ...refreshPolicy,
    gcTime: Number.POSITIVE_INFINITY,
  });

  const leaderboardDetailFetchCount = useIsFetching({
    queryKey: ['epi-leaderboard-detail', selectedMonthKey],
  });
  const isRefreshing = dashboardQuery.isFetching || leaderboardSummaryQuery.isFetching || leaderboardDetailFetchCount > 0;

  const handleRefresh = useCallback(async () => {
    const results = await Promise.allSettled([
      dashboardQuery.refetch({ cancelRefetch: false, throwOnError: true }),
      leaderboardSummaryQuery.refetch({ cancelRefetch: false, throwOnError: true }),
      queryClient.refetchQueries(
        {
          queryKey: ['epi-leaderboard-detail', selectedMonthKey],
          type: 'active',
        },
        {
          cancelRefetch: false,
          throwOnError: true,
        },
      ),
    ]);

    if (results.some((result) => result.status === 'rejected')) {
      showErrorToast('Failed to refresh dashboard.');
    }
  }, [dashboardQuery, leaderboardSummaryQuery, queryClient, selectedMonthKey, showErrorToast]);

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
              headerAction={(
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { void handleRefresh(); }}
                  disabled={isRefreshing}
                  title="Refresh dashboard"
                  className="w-full gap-2 rounded-xl border border-gray-200 bg-white/80 px-3.5 py-2 text-gray-700 shadow-sm backdrop-blur-sm hover:bg-white sm:w-auto dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </Button>
              )}
              selectedMonthKey={selectedMonthKey}
              onSelectMonth={setSelectedMonthKey}
            />
          )}
        </>
      )}
    </div>
  );
}
