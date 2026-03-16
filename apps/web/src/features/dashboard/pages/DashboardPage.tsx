import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';
import { EpiDashboard } from '../components/epi/EpiDashboard';
import { MOCK_EPI_DATA, MOCK_LEADERBOARD } from '../components/epi/mockData';

export function DashboardPage() {
  const { hasPermission } = usePermission();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-6">
      {hasPermission(PERMISSIONS.DASHBOARD_VIEW_PERFORMANCE_INDEX) && (
        <EpiDashboard
          data={MOCK_EPI_DATA}
          leaderboard={MOCK_LEADERBOARD}
          firstName={user?.firstName || 'User'}
        />
      )}
    </div>
  );
}
