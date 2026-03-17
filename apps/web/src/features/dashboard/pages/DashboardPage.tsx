import { useEffect, useState } from 'react';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';
import { EpiDashboard } from '../components/epi/EpiDashboard';
import { fetchEpiDashboard, fetchEpiLeaderboard } from '../services/epi.api';
import type { EpiDashboardData, LeaderboardEntry } from '../components/epi/types';

export function DashboardPage() {
  const { hasPermission } = usePermission();
  const user = useAuthStore((s) => s.user);

  const [data, setData] = useState<EpiDashboardData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPermission(PERMISSIONS.DASHBOARD_VIEW_PERFORMANCE_INDEX)) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const [dashboardData, leaderboardData] = await Promise.all([
          fetchEpiDashboard(),
          fetchEpiLeaderboard(user?.id),
        ]);
        if (!cancelled) {
          setData(dashboardData);
          setLeaderboard(leaderboardData);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load EPI data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [hasPermission, user?.id]);

  return (
    <div className="space-y-6">
      {hasPermission(PERMISSIONS.DASHBOARD_VIEW_PERFORMANCE_INDEX) && (
        <>
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500 dark:text-gray-400">
              Loading performance data…
            </div>
          )}
          {error && !loading && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}
          {!loading && !error && data && (
            <EpiDashboard
              data={data}
              leaderboard={leaderboard}
              firstName={user?.firstName || 'User'}
            />
          )}
        </>
      )}
    </div>
  );
}
